import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Catalog, type CatalogTool } from "../src/catalog/catalog";

describe("Catalog", () => {
  let tempDir: string;
  let catalog: Catalog;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tmcp-cat-"));
    catalog = new Catalog({ path: join(tempDir, "catalog.sqlite") });
    await catalog.open();
  });

  afterEach(() => {
    catalog.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function makeTool(
    service: string,
    toolName: string,
    description = "",
  ): CatalogTool {
    return {
      service,
      toolName,
      description,
      inputSchema: { type: "object", properties: {} },
      versionHash: `${service}_${toolName}`.slice(0, 16),
      indexedAt: Date.now(),
    };
  }

  it("listAll returns empty initially", async () => {
    expect(await catalog.listAll()).toEqual([]);
  });

  it("upsertService inserts tools", async () => {
    await catalog.upsertService("linear", [
      makeTool("linear", "linear_create_issue", "create"),
      makeTool("linear", "linear_list_teams", "list"),
    ]);
    const all = await catalog.listAll();
    expect(all).toHaveLength(2);
    expect(all[0].service).toBe("linear");
  });

  it("upsertService replaces existing tools for that service", async () => {
    await catalog.upsertService("linear", [makeTool("linear", "old_tool")]);
    await catalog.upsertService("linear", [
      makeTool("linear", "new_tool_a"),
      makeTool("linear", "new_tool_b"),
    ]);
    const all = await catalog.listAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.toolName).sort()).toEqual([
      "new_tool_a",
      "new_tool_b",
    ]);
  });

  it("upsert one service doesn't affect another", async () => {
    await catalog.upsertService("linear", [makeTool("linear", "l1")]);
    await catalog.upsertService("slack", [makeTool("slack", "s1")]);
    await catalog.upsertService("linear", [makeTool("linear", "l2")]);
    const all = await catalog.listAll();
    expect(all.map((t) => `${t.service}:${t.toolName}`).sort()).toEqual([
      "linear:l2",
      "slack:s1",
    ]);
  });

  it("listByService filters", async () => {
    await catalog.upsertService("linear", [
      makeTool("linear", "l1"),
      makeTool("linear", "l2"),
    ]);
    await catalog.upsertService("slack", [makeTool("slack", "s1")]);
    expect((await catalog.listByService("linear")).length).toBe(2);
    expect((await catalog.listByService("slack")).length).toBe(1);
  });

  it("get returns a single tool", async () => {
    const tool = makeTool("linear", "linear_create_issue", "creates an issue");
    await catalog.upsertService("linear", [tool]);
    const got = await catalog.get("linear", "linear_create_issue");
    expect(got?.description).toBe("creates an issue");
    expect(got?.inputSchema).toEqual({ type: "object", properties: {} });
  });

  it("get returns null for missing tool", async () => {
    expect(await catalog.get("never", "exists")).toBeNull();
  });

  it("persists across reopens", async () => {
    await catalog.upsertService("linear", [makeTool("linear", "l1")]);
    catalog.close();
    const reopened = new Catalog({ path: join(tempDir, "catalog.sqlite") });
    await reopened.open();
    try {
      expect((await reopened.listAll())[0].toolName).toBe("l1");
    } finally {
      reopened.close();
    }
  });

  it("open is idempotent", async () => {
    await expect(catalog.open()).resolves.toBeUndefined();
  });

  it("ensures parent directory exists", async () => {
    const nested = new Catalog({
      path: join(tempDir, "deep", "nested", "catalog.sqlite"),
    });
    await nested.open();
    try {
      await nested.upsertService("x", [makeTool("x", "x1")]);
      expect((await nested.listAll()).length).toBe(1);
    } finally {
      nested.close();
    }
  });
});
