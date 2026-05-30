import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ConnectionsStore,
  type ConnectionRecord,
} from "../src/stores/connections-store";

describe("ConnectionsStore", () => {
  let tempDir: string;
  let indexPath: string;
  let store: ConnectionsStore;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tensor-mcp-core-stores-test-"));
    indexPath = join(tempDir, "connections.json");
    store = new ConnectionsStore({ path: indexPath });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty list when file doesn't exist", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("returns null on get when entry doesn't exist", async () => {
    expect(await store.get("never")).toBeNull();
  });

  it("sets and retrieves a record", async () => {
    const rec: ConnectionRecord = {
      service: "linear",
      connectionId: "linear:default",
      displayName: "Linear",
      connectedAt: 1700000000000,
    };
    await store.set("linear:default", rec);
    const got = await store.get("linear:default");
    expect(got).toEqual(rec);
  });

  it("set replaces existing record by key", async () => {
    await store.set("linear:default", {
      service: "linear",
      connectionId: "linear:default",
      connectedAt: 1,
    });
    await store.set("linear:default", {
      service: "linear",
      connectionId: "linear:default",
      connectedAt: 2,
    });
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.value.connectedAt).toBe(2);
  });

  it("rejects set when key does not match connectionId", async () => {
    await expect(
      store.set("mismatch", {
        service: "linear",
        connectionId: "linear:default",
        connectedAt: 1,
      }),
    ).rejects.toThrow(/must match value\.connectionId/);
  });

  it("list returns records sorted by connectedAt descending", async () => {
    await store.set("a:1", { service: "a", connectionId: "a:1", connectedAt: 100 });
    await store.set("b:1", { service: "b", connectionId: "b:1", connectedAt: 300 });
    await store.set("c:1", { service: "c", connectionId: "c:1", connectedAt: 200 });
    const list = await store.list();
    expect(list.map((r) => r.key)).toEqual(["b:1", "c:1", "a:1"]);
  });

  it("list returns { key, value } entries with matching connectionId", async () => {
    const rec: ConnectionRecord = {
      service: "linear",
      connectionId: "linear:default",
      connectedAt: 1,
    };
    await store.set("linear:default", rec);
    const list = await store.list();
    expect(list[0]?.key).toBe("linear:default");
    expect(list[0]?.value).toEqual(rec);
  });

  it("delete removes a record", async () => {
    await store.set("linear:default", {
      service: "linear",
      connectionId: "linear:default",
      connectedAt: 1,
    });
    await store.delete("linear:default");
    expect(await store.list()).toEqual([]);
  });

  it("delete is idempotent", async () => {
    await expect(store.delete("never-existed")).resolves.toBeUndefined();
  });

  it("creates the parent directory on first set", async () => {
    const nested = new ConnectionsStore({
      path: join(tempDir, "nested", "deep", "connections.json"),
    });
    await nested.set("x:1", { service: "x", connectionId: "x:1", connectedAt: 1 });
    const list = await nested.list();
    expect(list[0]?.value.connectionId).toBe("x:1");
  });

  it("throws on corrupted JSON", async () => {
    await Bun.write(indexPath, "this is not JSON{{");
    await expect(store.list()).rejects.toThrow(/corrupted/i);
  });

  it("set and delete persist across instances", async () => {
    await store.set("linear:default", {
      service: "linear",
      connectionId: "linear:default",
      connectedAt: 1,
    });
    const reopened = new ConnectionsStore({ path: indexPath });
    expect(await reopened.get("linear:default")).not.toBeNull();
    await reopened.delete("linear:default");
    const reopened2 = new ConnectionsStore({ path: indexPath });
    expect(await reopened2.list()).toEqual([]);
  });
});
