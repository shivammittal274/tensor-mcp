import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ConnectionsIndex, type ConnectionRecord } from "../src/connections-index";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("ConnectionsIndex", () => {
  let tempDir: string;
  let indexPath: string;
  let index: ConnectionsIndex;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tensor-mcp-test-"));
    indexPath = join(tempDir, "connections.json");
    index = new ConnectionsIndex({ path: indexPath });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty list when file doesn't exist", async () => {
    expect(await index.list()).toEqual([]);
  });

  it("returns null on get when entry doesn't exist", async () => {
    expect(await index.get("never")).toBeNull();
  });

  it("upserts and retrieves a record", async () => {
    const rec: ConnectionRecord = {
      service: "linear",
      connectionId: "linear:default",
      displayName: "Linear",
      connectedAt: 1700000000000,
    };
    await index.upsert(rec);
    const got = await index.get("linear:default");
    expect(got).toEqual(rec);
  });

  it("upsert replaces existing record by connectionId", async () => {
    await index.upsert({ service: "linear", connectionId: "linear:default", connectedAt: 1 });
    await index.upsert({ service: "linear", connectionId: "linear:default", connectedAt: 2 });
    const list = await index.list();
    expect(list).toHaveLength(1);
    expect(list[0].connectedAt).toBe(2);
  });

  it("list returns records sorted by connectedAt descending", async () => {
    await index.upsert({ service: "a", connectionId: "a:1", connectedAt: 100 });
    await index.upsert({ service: "b", connectionId: "b:1", connectedAt: 300 });
    await index.upsert({ service: "c", connectionId: "c:1", connectedAt: 200 });
    const list = await index.list();
    expect(list.map(r => r.connectionId)).toEqual(["b:1", "c:1", "a:1"]);
  });

  it("remove deletes a record", async () => {
    await index.upsert({ service: "linear", connectionId: "linear:default", connectedAt: 1 });
    await index.remove("linear:default");
    expect(await index.list()).toEqual([]);
  });

  it("remove is idempotent", async () => {
    await expect(index.remove("never-existed")).resolves.toBeUndefined();
  });

  it("creates the parent directory on first upsert", async () => {
    const nested = new ConnectionsIndex({ path: join(tempDir, "nested", "deep", "connections.json") });
    await nested.upsert({ service: "x", connectionId: "x:1", connectedAt: 1 });
    expect((await nested.list())[0].connectionId).toBe("x:1");
  });

  it("throws on corrupted JSON", async () => {
    await Bun.write(indexPath, "this is not JSON{{");
    await expect(index.list()).rejects.toThrow(/corrupted/i);
  });

  it("upsert and remove persist across instances", async () => {
    await index.upsert({ service: "linear", connectionId: "linear:default", connectedAt: 1 });
    const reopened = new ConnectionsIndex({ path: indexPath });
    expect(await reopened.get("linear:default")).not.toBeNull();
    await reopened.remove("linear:default");
    const reopened2 = new ConnectionsIndex({ path: indexPath });
    expect(await reopened2.list()).toEqual([]);
  });
});
