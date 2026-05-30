import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { KeyValueStore, TokenBundle } from "../src/stores/types";

interface SdkAuthCall {
  serverUrl: string | URL;
  authorizationCode?: string;
  scope?: string;
}

const sdkCalls: SdkAuthCall[] = [];
let sdkAuthImpl: (
  provider: unknown,
  opts: SdkAuthCall,
) => Promise<"AUTHORIZED" | "REDIRECT"> = async () => "REDIRECT";

mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
  async auth(provider: unknown, opts: SdkAuthCall) {
    sdkCalls.push({ ...opts });
    return sdkAuthImpl(provider, opts);
  },
}));

const { mcpDcrAuth } = await import("../src/auth/mcp-dcr");

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

function makeOpts() {
  const tokenStore = new InlineMemoryStore<TokenBundle>();
  const oauthClientStore = new InlineMemoryStore<OAuthClientInformationFull>();
  return { tokenStore, oauthClientStore };
}

beforeEach(() => {
  sdkCalls.length = 0;
  sdkAuthImpl = async () => "REDIRECT";
});

describe("mcpDcrAuth", () => {
  test("method tag is 'oauth-dcr' and describe() includes hostname", () => {
    const s = mcpDcrAuth({ mcpServerUrl: "https://mcp.linear.app", scope: "read" });
    expect(s.method).toBe("oauth-dcr");
    expect(s.describe().instructions).toContain("mcp.linear.app");
  });

  test("two-call flow: REDIRECT then AUTHORIZED, returns persisted bundle", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = mcpDcrAuth({ mcpServerUrl: "https://mcp.linear.app", scope: "read write" });

    let capturedCallbackUrl = "";
    sdkAuthImpl = async (_provider, opts) => {
      if (!opts.authorizationCode) {
        // First call. Simulate the browser hitting our loopback callback with state.
        // We learn the redirectUri + expected state from the provider object the SDK was handed.
        const p = _provider as {
          redirectUrl: string;
          state: () => string;
        };
        capturedCallbackUrl = p.redirectUrl;
        const state = p.state();
        // Fire-and-forget the callback request after returning REDIRECT.
        setTimeout(() => {
          fetch(`${capturedCallbackUrl}?code=THE_CODE&state=${state}`).catch(() => {});
        }, 5);
        return "REDIRECT";
      }
      // Second call. Persist a token bundle as the SDK would via provider.saveTokens.
      const p = _provider as {
        saveTokens: (t: {
          access_token: string;
          token_type: string;
          expires_in?: number;
          refresh_token?: string;
          scope?: string;
        }) => Promise<void>;
      };
      await p.saveTokens({
        access_token: "AT-OK",
        token_type: "Bearer",
        expires_in: 1800,
        refresh_token: "RT-OK",
        scope: "read write",
      });
      return "AUTHORIZED";
    };

    const result = await strategy.connect({
      serviceId: "linear",
      tokenStore,
      oauthClientStore,
    });

    expect(result.access_token).toBe("AT-OK");
    expect(result.refresh_token).toBe("RT-OK");
    expect(result.scopes).toEqual(["read", "write"]);
    expect(typeof result.expires_at).toBe("number");

    expect(sdkCalls).toHaveLength(2);
    expect(sdkCalls[0]?.authorizationCode).toBeUndefined();
    expect(sdkCalls[0]?.serverUrl).toBe("https://mcp.linear.app");
    expect(sdkCalls[0]?.scope).toBe("read write");
    expect(sdkCalls[1]?.authorizationCode).toBe("THE_CODE");
    expect(sdkCalls[1]?.scope).toBe("read write");

    expect(capturedCallbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
  });

  test("first call returning AUTHORIZED is treated as protocol error", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = mcpDcrAuth({ mcpServerUrl: "https://mcp.linear.app" });

    sdkAuthImpl = async () => "AUTHORIZED";

    await expect(
      strategy.connect({ serviceId: "linear", tokenStore, oauthClientStore }),
    ).rejects.toThrow(/expected REDIRECT/);
  });

  test("CSRF: callback with wrong state rejects awaitCode and strategy throws", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = mcpDcrAuth({
      mcpServerUrl: "https://mcp.linear.app",
      timeoutMs: 3_000,
    });

    sdkAuthImpl = async (_provider, opts) => {
      if (!opts.authorizationCode) {
        const p = _provider as { redirectUrl: string };
        setTimeout(() => {
          fetch(`${p.redirectUrl}?code=X&state=WRONG`).catch(() => {});
        }, 5);
        return "REDIRECT";
      }
      return "AUTHORIZED";
    };

    await expect(
      strategy.connect({ serviceId: "linear", tokenStore, oauthClientStore }),
    ).rejects.toThrow(/state mismatch/);
  });

  test("provider.clientMetadata reflects redirect URI assigned by callback server", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = mcpDcrAuth({
      mcpServerUrl: "https://mcp.linear.app",
      clientName: "custom-client",
      scope: "scope-x",
    });

    let observedRedirectUri = "";
    let observedClientName = "";
    let observedScope: string | undefined;
    sdkAuthImpl = async (_provider, opts) => {
      const p = _provider as {
        redirectUrl: string;
        clientMetadata: { client_name?: string; redirect_uris?: string[]; scope?: string };
        state: () => string;
      };
      if (!opts.authorizationCode) {
        observedRedirectUri = p.redirectUrl;
        observedClientName = p.clientMetadata.client_name ?? "";
        observedScope = p.clientMetadata.scope;
        // ensure redirect_uris matches redirectUrl
        expect(p.clientMetadata.redirect_uris?.[0]).toBe(p.redirectUrl);
        setTimeout(() => {
          fetch(`${p.redirectUrl}?code=C&state=${p.state()}`).catch(() => {});
        }, 5);
        return "REDIRECT";
      }
      const pp = _provider as {
        saveTokens: (t: { access_token: string; token_type: string }) => Promise<void>;
      };
      await pp.saveTokens({ access_token: "OK", token_type: "Bearer" });
      return "AUTHORIZED";
    };

    await strategy.connect({ serviceId: "linear", tokenStore, oauthClientStore });
    expect(observedRedirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    expect(observedClientName).toBe("custom-client");
    expect(observedScope).toBe("scope-x");
  });
});
