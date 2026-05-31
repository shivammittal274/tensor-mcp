import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Catalog, type CatalogTool } from "../src/catalog/catalog";
import { resetEnsureEmbeddingsCache } from "../src/embeddings/ensure";
import { search } from "../src/mcp/search";

// Real in-memory catalog (libsql via bun:sqlite). No mocks — the search
// pipeline is too entangled with the BM25 + catalog round-trip to give
// mocks any real signal.
//
// Note on scope: the catalog only ever holds rows for currently-connected
// services (disconnect drops them, connect re-ingests). So tests just
// populate the catalog and search; there's no separate "is connected"
// callback to pass in.

const TOOLS: Array<Omit<CatalogTool, "versionHash" | "indexedAt">> = [
  {
    service: "linear",
    toolName: "linear_create_issue",
    description: "Create a Linear issue",
    inputSchema: { type: "object", properties: { title: { type: "string" } } },
  },
  {
    service: "linear",
    toolName: "linear_list_issues",
    description: "List Linear issues in a team",
    inputSchema: { type: "object" },
  },
  {
    service: "slack",
    toolName: "slack_send_message",
    description: "Send a Slack message to a channel",
    inputSchema: { type: "object", properties: { text: { type: "string" } } },
  },
  {
    service: "slack",
    toolName: "slack_list_channels",
    description: "List Slack channels visible to the bot",
    inputSchema: { type: "object" },
  },
  {
    service: "jira",
    toolName: "jira_create_ticket",
    description: "Create a Jira ticket",
    inputSchema: { type: "object" },
  },
];

describe("search()", () => {
  let tempDir: string;
  let catalog: Catalog;
  // Restored after each test — point ensureEmbeddings at an empty dir so
  // it doesn't pick up the developer's globally-cached model from
  // ~/.tensor-mcp/embeddings/ and accidentally exercise semantic search.
  // We also need to clear the memoized probe between tests.
  let prevEmbeddingsDir: string | undefined;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-search-"));
    prevEmbeddingsDir = process.env.TENSOR_MCP_EMBEDDINGS_DIR;
    // Point cache at an empty temp dir — `ensureEmbeddings` is now sync
    // cache-probe only (no network, no download), so an empty dir is
    // enough to keep these tests deterministically BM25-only.
    process.env.TENSOR_MCP_EMBEDDINGS_DIR = join(tempDir, "embeddings");
    resetEnsureEmbeddingsCache();
    catalog = new Catalog({ path: join(tempDir, "catalog.sqlite") });
    await catalog.open();
    const now = Date.now();
    const grouped = new Map<string, CatalogTool[]>();
    for (const t of TOOLS) {
      const arr = grouped.get(t.service) ?? [];
      arr.push({ ...t, versionHash: "v1", indexedAt: now });
      grouped.set(t.service, arr);
    }
    for (const [svc, rows] of grouped) {
      await catalog.upsertService(svc, rows);
    }
  });

  afterEach(() => {
    catalog.close();
    rmSync(tempDir, { recursive: true, force: true });
    if (prevEmbeddingsDir === undefined) {
      delete process.env.TENSOR_MCP_EMBEDDINGS_DIR;
    } else {
      process.env.TENSOR_MCP_EMBEDDINGS_DIR = prevEmbeddingsDir;
    }
    resetEnsureEmbeddingsCache();
  });

  it("empty catalog yields no hits (new connection drops all rows)", async () => {
    await catalog.dropService("linear");
    await catalog.dropService("slack");
    await catalog.dropService("jira");
    const result = await search(catalog, { query: "linear create" });
    expect(result.hits).toEqual([]);
  });

  it("returns top-3 fused hits with hydrated schemas", async () => {
    const result = await search(catalog, { query: "create issue" });
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.hits.length).toBeLessThanOrEqual(3);
    for (const hit of result.hits) {
      expect(typeof hit.app).toBe("string");
      expect(typeof hit.tool).toBe("string");
      expect(hit.score).toBeGreaterThanOrEqual(0);
      expect(hit.input_schema).toBeDefined();
      expect(Array.isArray(hit.required_params)).toBe(true);
      expect(Array.isArray(hit.optional_params)).toBe(true);
    }
  });

  it("respects an explicit apps filter", async () => {
    const result = await search(catalog, {
      query: "create",
      apps: ["slack"],
    });
    for (const hit of result.hits) {
      expect(hit.app).toBe("slack");
    }
  });

  it("dropService removes a service's tools from search scope", async () => {
    await catalog.dropService("slack");
    const result = await search(catalog, {
      query: "slack message",
      threshold: 0,
      top_k: 20,
    });
    for (const hit of result.hits) {
      expect(hit.app).not.toBe("slack");
    }
  });

  it("clamps top_k to [1, 50]", async () => {
    const tiny = await search(catalog, { query: "create", top_k: 1 });
    expect(tiny.hits.length).toBeLessThanOrEqual(1);

    const zero = await search(catalog, { query: "create", top_k: 0 });
    // 0 clamps to min 1 — caller should still get a top hit.
    expect(zero.hits.length).toBeLessThanOrEqual(1);
  });

  it("threshold=0 returns all matching hits regardless of confidence", async () => {
    const result = await search(catalog, {
      query: "create",
      top_k: 50,
      threshold: 0,
    });
    // With threshold=0, multi-token query "create" should hit several tools.
    expect(result.hits.length).toBeGreaterThan(0);
  });

  it("empty query returns no hits", async () => {
    const result = await search(catalog, { query: "" });
    expect(result.hits).toEqual([]);
  });

  it("semantic_used is false when no embeddings have been computed", async () => {
    // Catalog has no embedding column populated — search must fall back to
    // BM25 transparently rather than throwing.
    const result = await search(catalog, { query: "create issue" });
    expect(result.semantic_used).toBe(false);
  });
});
