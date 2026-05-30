import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Catalog } from "../src/catalog/catalog";
import { ConnectionsIndex } from "../src/connections-index";
import { BM25Search, type ToolIndexable } from "../src/search/bm25";
import { handleCall, handleSearch } from "../src/server";
import { SpawnPool, type SpawnPoolEntry } from "../src/subprocess/spawn-pool";
import { Vault } from "../src/vault";

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");
const TEST_VAULT_SERVICE = "com.tensormcp.cli.test.server";

const REGISTRY: Record<string, SpawnPoolEntry> = {
  linear: {
    vendorDir: "vendored/linear",
    commandTemplate: [
      "uv",
      "run",
      "--with-requirements",
      "requirements.txt",
      "python",
      "server.py",
      "--port",
      "{{PORT}}",
    ],
  },
};

describe("handleSearch", () => {
  let tempDir: string;
  let catalog: Catalog;
  let index: ConnectionsIndex;
  let searchIndex: BM25Search<ToolIndexable>;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-srv-"));
    catalog = new Catalog({ path: join(tempDir, "catalog.sqlite") });
    await catalog.open();
    await catalog.upsertService("linear", [
      {
        service: "linear",
        toolName: "linear_create_issue",
        description: "Create a new issue in Linear",
        inputSchema: { type: "object" },
        versionHash: "abc",
        indexedAt: 1,
      },
      {
        service: "linear",
        toolName: "linear_list_teams",
        description: "List teams in the workspace",
        inputSchema: { type: "object" },
        versionHash: "def",
        indexedAt: 1,
      },
    ]);
    await catalog.upsertService("slack", [
      {
        service: "slack",
        toolName: "slack_send_message",
        description: "Send a Slack message to a channel",
        inputSchema: { type: "object" },
        versionHash: "ghi",
        indexedAt: 1,
      },
    ]);
    const tools = await catalog.listAll();
    searchIndex = new BM25Search<ToolIndexable>(
      tools.map((t) => ({
        service: t.service,
        toolName: t.toolName,
        description: t.description,
      })),
    );
    index = new ConnectionsIndex({
      path: join(tempDir, "connections.json"),
    });
    await index.upsert({
      service: "linear",
      connectionId: "linear:default",
      connectedAt: Date.now(),
    });
  });

  afterAll(() => {
    catalog.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns ranked tools with schemas", async () => {
    const r = await handleSearch(
      { query: "create issue" },
      { searchIndex, catalog, index },
    );
    expect(r.primary_tools.length).toBeGreaterThan(0);
    expect(r.primary_tools[0].tool).toBe("linear_create_issue");
    expect(r.primary_tools[0].input_schema).toEqual({ type: "object" });
    expect(r.primary_tools[0].connection_status).toBe("active");
  });

  it("marks unconnected services as missing", async () => {
    const r = await handleSearch(
      { query: "send message slack" },
      { searchIndex, catalog, index },
    );
    const slack = r.primary_tools.find((t) => t.service === "slack");
    expect(slack?.connection_status).toBe("missing");
    expect(r.missing_connections.find((m) => m.service === "slack")).toBeTruthy();
  });

  it("respects top_k", async () => {
    const r = await handleSearch(
      { query: "list", top_k: 1 },
      { searchIndex, catalog, index },
    );
    expect(r.primary_tools.length).toBeLessThanOrEqual(1);
  });

  it("respects services filter", async () => {
    const r = await handleSearch(
      { query: "list", services: ["linear"] },
      { searchIndex, catalog, index },
    );
    expect(r.primary_tools.every((t) => t.service === "linear")).toBe(true);
  });
});

describe("handleCall", () => {
  let tempDir: string;
  let vault: Vault;
  let pool: SpawnPool;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-call-"));
    vault = new Vault({ service: TEST_VAULT_SERVICE });
    pool = new SpawnPool(REGISTRY, TENSOR_MCP_ROOT);
    await vault.delete("linear:default").catch(() => undefined);
  });

  afterAll(async () => {
    rmSync(tempDir, { recursive: true, force: true });
    await pool.shutdown();
  });

  it("throws when service not connected", async () => {
    await expect(
      handleCall(
        { service: "linear", tool: "linear_list_teams" },
        { vault, spawnPool: pool, registry: REGISTRY },
      ),
    ).rejects.toThrow(/not connected/);
  });

  it("throws on unknown service", async () => {
    await expect(
      handleCall(
        { service: "nope", tool: "x" },
        { vault, spawnPool: pool, registry: REGISTRY },
      ),
    ).rejects.toThrow(/unknown service/);
  });
});
