import { afterEach, describe, expect, it } from "bun:test";
import { Entry, KeyringError } from "@tensor-mcp/keyring";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { OAuthClientStore } from "../src/stores/oauth-client-store";

const TEST_SERVICE = "com.tensormcp.test.oauth-client-store";
const TEST_CLIENT: OAuthClientInformationFull = {
  client_id: "client-abc",
  client_secret: "secret-xyz",
  redirect_uris: ["https://app.example.com/callback"],
  client_name: "Tensor Test Client",
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "client_secret_basic",
};

describe("OAuthClientStore", () => {
  const store = new OAuthClientStore({ service: TEST_SERVICE });

  afterEach(async () => {
    const cleanup = async (id: string) => {
      try {
        await store.delete(id);
      } catch (err) {
        if (err instanceof KeyringError && err.kind === "NoEntry") return;
        throw err;
      }
    };
    await cleanup("test-issuer");
    await cleanup("never-stored");
    await cleanup("corrupt-issuer");
  });

  it("stores and retrieves a client", async () => {
    await store.set("test-issuer", TEST_CLIENT);
    const got = await store.get("test-issuer");
    expect(got).not.toBeNull();
    expect(got?.client_id).toBe("client-abc");
    expect(got?.client_secret).toBe("secret-xyz");
    expect(got?.redirect_uris).toEqual(["https://app.example.com/callback"]);
    expect(got?.client_name).toBe("Tensor Test Client");
  });

  it("returns null for missing key", async () => {
    expect(await store.get("never-stored")).toBeNull();
  });

  it("delete is idempotent", async () => {
    await expect(store.delete("never-stored")).resolves.toBeUndefined();
  });

  it("throws when stored value is valid JSON but missing client_id", async () => {
    const entry = new Entry(TEST_SERVICE, "corrupt-issuer");
    await entry.setPassword(JSON.stringify({ redirect_uris: [] }));
    await expect(store.get("corrupt-issuer")).rejects.toThrow(
      /invalid (client|value) shape/,
    );
  });
});
