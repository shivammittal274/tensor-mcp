import { describe, expect, it } from "bun:test";
import { MemoryStore } from "../src/stores/memory-store";

describe("MemoryStore", () => {
  it("set/get/delete/list round-trip", async () => {
    const store = new MemoryStore<{ n: number }>();
    expect(await store.get("a")).toBeNull();
    await store.set("a", { n: 1 });
    await store.set("b", { n: 2 });
    expect(await store.get("a")).toEqual({ n: 1 });
    const all = await store.list();
    expect(all.map((e) => e.key).sort()).toEqual(["a", "b"]);
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
    await store.delete("never-existed");
  });
});
