import { describe, expect, test } from "bun:test";
import type {
  AuthorizationServerMetadata,
  OAuthClientMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { staticOAuthAuth } from "../src/auth/static-oauth";
import {
  StaticOAuthProvider,
  type StaticOAuthProviderOpts,
} from "../src/auth/static-oauth-provider";
import type { KeyValueStore, TokenBundle } from "../src/stores/types";

const SAMPLE_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256", "plain"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
  ],
};

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
    return Array.from(this.#data.entries()).map(([key, value]) => ({
      key,
      value,
    }));
  }
}

function makeProvider(overrides: Partial<StaticOAuthProviderOpts> = {}): {
  provider: StaticOAuthProvider;
  tokenStore: InlineMemoryStore<TokenBundle>;
  browserUrls: string[];
} {
  const tokenStore = new InlineMemoryStore<TokenBundle>();
  const browserUrls: string[] = [];
  const clientMetadata: OAuthClientMetadata = {
    client_name: "tensor-mcp",
    redirect_uris: ["http://127.0.0.1:0/callback"],
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
  const provider = new StaticOAuthProvider({
    serviceId: "gmail",
    tokenStore,
    redirectUrl: "http://127.0.0.1:0/callback",
    clientMetadata,
    clientInfo: {
      client_id: "fake-client-id.apps.googleusercontent.com",
      client_secret: "fake-secret",
    },
    authServerUrl: "https://accounts.google.com",
    authServerMetadata: SAMPLE_AS_METADATA,
    state: "state-abc",
    openBrowser: async (url) => {
      browserUrls.push(url);
    },
    ...overrides,
  });
  return { provider, tokenStore, browserUrls };
}

describe("StaticOAuthProvider", () => {
  test("discoveryState returns the hardcoded auth-server metadata", async () => {
    const { provider } = makeProvider();
    const state = await provider.discoveryState();
    expect(state.authorizationServerUrl).toBe("https://accounts.google.com");
    expect(state.authorizationServerMetadata).toEqual(SAMPLE_AS_METADATA);
  });

  test("clientInformation returns the hardcoded client_id + secret", async () => {
    const { provider } = makeProvider();
    const info = await provider.clientInformation();
    expect(info.client_id).toBe("fake-client-id.apps.googleusercontent.com");
    expect(info.client_secret).toBe("fake-secret");
  });

  test("saveDiscoveryState is a no-op (does not throw)", async () => {
    const { provider } = makeProvider();
    await provider.saveDiscoveryState({
      authorizationServerUrl: "https://other.example.com",
      authorizationServerMetadata: SAMPLE_AS_METADATA,
    });
  });

  test("redirectToAuthorization opens the browser to the given URL", async () => {
    const { provider, browserUrls } = makeProvider();
    await provider.redirectToAuthorization(
      new URL("https://accounts.google.com/o/oauth2/v2/auth?foo=bar"),
    );
    expect(browserUrls).toEqual([
      "https://accounts.google.com/o/oauth2/v2/auth?foo=bar",
    ]);
  });

  test("state(), redirectUrl, clientMetadata reflect constructor opts", () => {
    const { provider } = makeProvider();
    expect(provider.state()).toBe("state-abc");
    expect(provider.redirectUrl).toBe("http://127.0.0.1:0/callback");
    expect(provider.clientMetadata.client_name).toBe("tensor-mcp");
    expect(provider.clientMetadata.response_types).toEqual(["code"]);
  });

  test("saveCodeVerifier + codeVerifier round-trip", async () => {
    const { provider } = makeProvider();
    await provider.saveCodeVerifier("verifier-xyz");
    expect(await provider.codeVerifier()).toBe("verifier-xyz");
  });

  test("codeVerifier throws if not previously saved", async () => {
    const { provider } = makeProvider();
    await expect(provider.codeVerifier()).rejects.toThrow(
      /code verifier not saved/,
    );
  });

  test("tokens() returns undefined when nothing persisted", async () => {
    const { provider } = makeProvider();
    expect(await provider.tokens()).toBeUndefined();
  });

  test("saveTokens + tokens() round-trip access_token, scope, expires_in", async () => {
    const { provider } = makeProvider();
    await provider.saveTokens({
      access_token: "tok-1",
      token_type: "Bearer",
      refresh_token: "rt-1",
      expires_in: 3600,
      scope: "read write",
    });
    const t = await provider.tokens();
    expect(t?.access_token).toBe("tok-1");
    expect(t?.refresh_token).toBe("rt-1");
    expect(t?.scope).toBe("read write");
    expect(t?.expires_in).toBeGreaterThan(3590);
    expect(t?.expires_in).toBeLessThanOrEqual(3600);
  });

  test("saveTokens preserves prior refresh_token if response omits it", async () => {
    const { provider, tokenStore } = makeProvider();
    await tokenStore.set("gmail", {
      access_token: "old",
      refresh_token: "rt-from-before",
    });
    await provider.saveTokens({
      access_token: "new",
      token_type: "Bearer",
      expires_in: 3600,
    });
    const t = await provider.tokens();
    expect(t?.refresh_token).toBe("rt-from-before");
  });
});

describe("staticOAuthAuth (strategy factory)", () => {
  test("method tag is 'oauth-static'", () => {
    const s = staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: SAMPLE_AS_METADATA,
      clientId: "x",
      clientSecret: "y",
    });
    expect(s.method).toBe("oauth-static");
  });

  test("describe() with configured clientId mentions the auth-server host", () => {
    const s = staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: SAMPLE_AS_METADATA,
      clientId: "x",
    });
    expect(s.describe().instructions).toContain("accounts.google.com");
  });

  test("describe() with empty clientId reports 'not configured' + register URL", () => {
    const s = staticOAuthAuth({
      authServerUrl: "https://slack.com",
      authServerMetadata: SAMPLE_AS_METADATA,
      clientId: "",
      registerAppUrl: "https://api.slack.com/apps",
    });
    const msg = s.describe().instructions;
    expect(msg).toMatch(/not configured/i);
    expect(msg).toContain("https://api.slack.com/apps");
  });

  test("connect() with empty clientId throws before opening a browser", async () => {
    const tokenStore = new InlineMemoryStore<TokenBundle>();
    const oauthClientStore = new InlineMemoryStore<never>();
    const browserUrls: string[] = [];
    const s = staticOAuthAuth({
      authServerUrl: "https://api.slack.com",
      authServerMetadata: SAMPLE_AS_METADATA,
      clientId: "",
      registerAppUrl: "https://api.slack.com/apps",
    });
    await expect(
      s.connect({
        serviceId: "slack:default",
        tokenStore,
        // biome-ignore lint/suspicious/noExplicitAny: test stub
        oauthClientStore: oauthClientStore as any,
        io: {
          openBrowser: async (url) => {
            browserUrls.push(url);
          },
        },
      }),
    ).rejects.toThrow(/not configured/i);
    expect(browserUrls).toEqual([]);
  });

  test("custom description is used when clientId is set", () => {
    const s = staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: SAMPLE_AS_METADATA,
      clientId: "x",
      description: "Sign in with your Google account",
    });
    expect(s.describe().instructions).toBe(
      "Sign in with your Google account",
    );
  });
});
