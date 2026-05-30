import { describe, it, expect, afterEach } from "bun:test";
import { Entry, KeyringError } from "@tensor-mcp/keyring";
import { Vault, type TokenBlob } from "../src/vault";

const TEST_SERVICE = "com.tensormcp.cli.test";
const TEST_BLOB: TokenBlob = {
  access_token: "tok_test_123",
  refresh_token: "ref_test_456",
  expires_at: Date.now() + 3_600_000,
  scopes: ["read", "write"],
};

describe("Vault", () => {
  const vault = new Vault({ service: TEST_SERVICE });

  afterEach(async () => {
    const cleanup = async (id: string) => {
      try {
        await vault.delete(id);
      } catch (err) {
        if (err instanceof KeyringError && err.kind === "NoEntry") return;
        throw err;
      }
    };
    await cleanup("test-conn");
    await cleanup("never-stored");
    await cleanup("corrupt-conn");
  });

  it("stores and retrieves a token blob", async () => {
    await vault.set("test-conn", TEST_BLOB);
    const got = await vault.get("test-conn");
    expect(got).not.toBeNull();
    expect(got?.access_token).toBe("tok_test_123");
    expect(got?.refresh_token).toBe("ref_test_456");
    expect(got?.scopes).toEqual(["read", "write"]);
    expect(got?.expires_at).toBe(TEST_BLOB.expires_at);
  });

  it("returns null for missing connection", async () => {
    const got = await vault.get("never-stored");
    expect(got).toBeNull();
  });

  it("overwrites existing blob on set", async () => {
    await vault.set("test-conn", { access_token: "first" });
    await vault.set("test-conn", { access_token: "second" });
    const got = await vault.get("test-conn");
    expect(got?.access_token).toBe("second");
  });

  it("delete removes the entry", async () => {
    await vault.set("test-conn", { access_token: "tmp" });
    await vault.delete("test-conn");
    const got = await vault.get("test-conn");
    expect(got).toBeNull();
  });

  it("delete is idempotent (no throw on missing)", async () => {
    await expect(vault.delete("never-stored")).resolves.toBeUndefined();
  });

  it("roundtrips a minimal blob with only access_token", async () => {
    await vault.set("test-conn", { access_token: "minimal" });
    const got = await vault.get("test-conn");
    expect(got?.access_token).toBe("minimal");
    expect(got?.refresh_token).toBeUndefined();
    expect(got?.expires_at).toBeUndefined();
    expect(got?.scopes).toBeUndefined();
  });

  it("throws on corrupted JSON in the keychain", async () => {
    const entry = new Entry(TEST_SERVICE, "corrupt-conn");
    await entry.setPassword("this-is-not-json{");
    await expect(vault.get("corrupt-conn")).rejects.toThrow(/corrupted JSON/);
  });

  it("throws when stored value is valid JSON but wrong shape", async () => {
    const entry = new Entry(TEST_SERVICE, "corrupt-conn");
    await entry.setPassword(JSON.stringify({ foo: "bar" }));
    await expect(vault.get("corrupt-conn")).rejects.toThrow(
      /invalid token shape/,
    );
  });
});
