import { describe, expect, test } from "bun:test";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore, TokenBundle } from "../src/stores/types";
import { VaultBackedOAuthProvider } from "../src/auth/provider";

class InlineMemoryStore<T> implements KeyValueStore<T> {
  #data = new Map<string, T>();
  async get(key: string): Promise<T | null> {
    return this.#data.has(key) ? (this.#data.get(key) as T) : null;
  }
  async set(key: string, value: T): Promise<void> {
    this.#data.set(key, value);
  }
  async delete(key: string): Promise<void> {
    this.#data.delete(key);
  }
  async list(): Promise<Array<{ key: string; value: T }>> {
    return Array.from(this.#data.entries()).map(([key, value]) => ({ key, value }));
  }
}

function baseClientMetadata() {
  return {
    client_name: "tensor-mcp",
    redirect_uris: ["http://127.0.0.1:1234/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

function makeProvider(overrides?: {
  serviceId?: string;
  state?: string;
  openBrowser?: (url: string) => Promise<void>;
}) {
  const tokenStore = new InlineMemoryStore<TokenBundle>();
  const oauthClientStore = new InlineMemoryStore<OAuthClientInformationFull>();
  const provider = new VaultBackedOAuthProvider({
    serviceId: overrides?.serviceId ?? "linear",
    tokenStore,
    oauthClientStore,
    redirectUrl: "http://127.0.0.1:1234/callback",
    clientMetadata: baseClientMetadata(),
    state: overrides?.state ?? "abc123",
    openBrowser: overrides?.openBrowser ?? (async () => {}),
  });
  return { provider, tokenStore, oauthClientStore };
}

describe("VaultBackedOAuthProvider", () => {
  test("exposes redirectUrl, clientMetadata, state synchronously", () => {
    const { provider } = makeProvider();
    expect(provider.redirectUrl).toBe("http://127.0.0.1:1234/callback");
    expect(provider.clientMetadata.client_name).toBe("tensor-mcp");
    expect(provider.state()).toBe("abc123");
  });

  test("clientInformation returns undefined when nothing persisted", async () => {
    const { provider } = makeProvider();
    expect(await provider.clientInformation()).toBeUndefined();
  });

  test("saveClientInformation round-trips through the store", async () => {
    const { provider, oauthClientStore } = makeProvider();
    const info = {
      client_id: "cid",
      client_secret: "csec",
      redirect_uris: ["http://127.0.0.1:1234/callback"],
    } as unknown as OAuthClientInformationFull;
    await provider.saveClientInformation(info);
    expect(await oauthClientStore.get("linear")).toEqual(info);
    expect(await provider.clientInformation()).toEqual(info);
  });

  test("tokens returns undefined when nothing persisted", async () => {
    const { provider } = makeProvider();
    expect(await provider.tokens()).toBeUndefined();
  });

  test("saveTokens computes expires_at from expires_in", async () => {
    const { provider, tokenStore } = makeProvider();
    const t0 = Date.now();
    await provider.saveTokens({
      access_token: "AT",
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: "RT",
      scope: "read write",
    });
    const stored = await tokenStore.get("linear");
    expect(stored?.access_token).toBe("AT");
    expect(stored?.refresh_token).toBe("RT");
    expect(stored?.scopes).toEqual(["read", "write"]);
    expect(stored?.expires_at).toBeGreaterThanOrEqual(t0 + 3600 * 1000 - 50);
    expect(stored?.expires_at).toBeLessThanOrEqual(t0 + 3600 * 1000 + 50);
  });

  test("saveTokens without expires_in omits expires_at", async () => {
    const { provider, tokenStore } = makeProvider();
    await provider.saveTokens({ access_token: "AT", token_type: "Bearer" });
    const stored = await tokenStore.get("linear");
    expect(stored?.expires_at).toBeUndefined();
    expect(stored?.scopes).toBeUndefined();
    expect(stored?.refresh_token).toBeUndefined();
  });

  test("tokens converts expires_at back to remaining expires_in (seconds)", async () => {
    const { provider, tokenStore } = makeProvider();
    const expiresAt = Date.now() + 60_000;
    const bundle: TokenBundle = {
      access_token: "AT2",
      refresh_token: "RT2",
      expires_at: expiresAt,
      scopes: ["read"],
    };
    await tokenStore.set("linear", bundle);
    const t = await provider.tokens();
    expect(t).toBeDefined();
    expect(t?.access_token).toBe("AT2");
    expect(t?.token_type).toBe("Bearer");
    expect(t?.refresh_token).toBe("RT2");
    expect(t?.scope).toBe("read");
    expect(t?.expires_in).toBeGreaterThanOrEqual(58);
    expect(t?.expires_in).toBeLessThanOrEqual(60);
  });

  test("tokens clamps expires_in to 0 when bundle has expired", async () => {
    const { provider, tokenStore } = makeProvider();
    await tokenStore.set("linear", {
      access_token: "AT",
      expires_at: Date.now() - 10_000,
    });
    const t = await provider.tokens();
    expect(t?.expires_in).toBe(0);
  });

  test("saveTokens preserves prior refresh_token if response omits one", async () => {
    const { provider, tokenStore } = makeProvider();
    await tokenStore.set("linear", { access_token: "old", refresh_token: "RT-keep" });
    await provider.saveTokens({
      access_token: "new",
      token_type: "Bearer",
      expires_in: 60,
    });
    const stored = await tokenStore.get("linear");
    expect(stored?.access_token).toBe("new");
    expect(stored?.refresh_token).toBe("RT-keep");
  });

  test("code verifier is held in memory and required by codeVerifier()", async () => {
    const { provider } = makeProvider();
    await expect(provider.codeVerifier()).rejects.toThrow(/code verifier not saved/);
    await provider.saveCodeVerifier("v123");
    expect(await provider.codeVerifier()).toBe("v123");
  });

  test("code verifier is not persisted to either store", async () => {
    const { provider, tokenStore, oauthClientStore } = makeProvider();
    await provider.saveCodeVerifier("verifier-secret");
    expect(await tokenStore.list()).toHaveLength(0);
    expect(await oauthClientStore.list()).toHaveLength(0);
  });

  test("redirectToAuthorization calls openBrowser with full URL string", async () => {
    const captured: string[] = [];
    const { provider } = makeProvider({
      openBrowser: async (u) => {
        captured.push(u);
      },
    });
    await provider.redirectToAuthorization(new URL("https://idp.example/auth?x=1"));
    expect(captured).toEqual(["https://idp.example/auth?x=1"]);
  });
});
