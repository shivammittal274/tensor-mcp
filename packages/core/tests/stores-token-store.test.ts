import { afterEach, describe, expect, it } from "bun:test";
import { Entry, KeyringError } from "@tensor-mcp/keyring";
import { TokenStore } from "../src/stores/token-store";
import type { TokenBundle } from "../src/stores/types";

const TEST_SERVICE = "com.tensormcp.test.token-store";
const TEST_BUNDLE: TokenBundle = {
  access_token: "tok_test_123",
  refresh_token: "ref_test_456",
  expires_at: Date.now() + 3_600_000,
  scopes: ["read", "write"],
  metadata: { selected_cloud_id: "cloud-xyz" },
};

describe("TokenStore", () => {
  const store = new TokenStore({ service: TEST_SERVICE });

  afterEach(async () => {
    const cleanup = async (id: string) => {
      try {
        await store.delete(id);
      } catch (err) {
        if (err instanceof KeyringError && err.kind === "NoEntry") return;
        throw err;
      }
    };
    await cleanup("test-conn");
    await cleanup("never-stored");
    await cleanup("corrupt-conn");
  });

  it("stores and retrieves a token bundle", async () => {
    await store.set("test-conn", TEST_BUNDLE);
    const got = await store.get("test-conn");
    expect(got).not.toBeNull();
    expect(got?.access_token).toBe("tok_test_123");
    expect(got?.refresh_token).toBe("ref_test_456");
    expect(got?.scopes).toEqual(["read", "write"]);
    expect(got?.expires_at).toBe(TEST_BUNDLE.expires_at);
    expect(got?.metadata).toEqual({ selected_cloud_id: "cloud-xyz" });
  });

  it("returns null for missing key", async () => {
    const got = await store.get("never-stored");
    expect(got).toBeNull();
  });

  it("overwrites existing bundle on set", async () => {
    await store.set("test-conn", { access_token: "first" });
    await store.set("test-conn", { access_token: "second" });
    const got = await store.get("test-conn");
    expect(got?.access_token).toBe("second");
  });

  it("delete removes the entry", async () => {
    await store.set("test-conn", { access_token: "tmp" });
    await store.delete("test-conn");
    expect(await store.get("test-conn")).toBeNull();
  });

  it("delete is idempotent (no throw on missing)", async () => {
    await expect(store.delete("never-stored")).resolves.toBeUndefined();
  });

  it("roundtrips a minimal bundle with only access_token", async () => {
    await store.set("test-conn", { access_token: "minimal" });
    const got = await store.get("test-conn");
    expect(got?.access_token).toBe("minimal");
    expect(got?.refresh_token).toBeUndefined();
    expect(got?.expires_at).toBeUndefined();
    expect(got?.scopes).toBeUndefined();
    expect(got?.metadata).toBeUndefined();
  });

  it("throws on corrupted JSON in the keychain", async () => {
    const entry = new Entry(TEST_SERVICE, "corrupt-conn");
    await entry.setPassword("this-is-not-json{");
    await expect(store.get("corrupt-conn")).rejects.toThrow(/corrupted JSON/);
  });

  it("throws when stored value is valid JSON but wrong shape", async () => {
    const entry = new Entry(TEST_SERVICE, "corrupt-conn");
    await entry.setPassword(JSON.stringify({ foo: "bar" }));
    await expect(store.get("corrupt-conn")).rejects.toThrow(/invalid (token|value) shape/);
  });

  it("list returns an empty array (no enumeration primitive yet)", async () => {
    await store.set("test-conn", { access_token: "x" });
    expect(await store.list()).toEqual([]);
  });
});
