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

// The mock replaces the whole module — bun:test has no partial-mock primitive.
// Spread the real exports through so other tests in this process that
// transitively load this same module (e.g. mcp-execute.test.ts →
// streamableHttp → SDK internals depend on `UnauthorizedError`,
// `extractWWWAuthenticateParams`, …) keep working. Only `auth` is replaced.
const realSdkAuth = await import("@modelcontextprotocol/sdk/client/auth.js");

mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
  ...realSdkAuth,
  async auth(provider: unknown, opts: SdkAuthCall) {
    sdkCalls.push({ ...opts });
    return sdkAuthImpl(provider, opts);
  },
}));

const { dcrAuth } = await import("../src/auth/dcr");

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

describe("dcrAuth", () => {
  test("method tag is 'oauth-dcr' and describe() includes hostname", () => {
    const s = dcrAuth({ mcpServerUrl: "https://mcp.linear.app", scope: "read" });
    expect(s.method).toBe("oauth-dcr");
    expect(s.describe().instructions).toContain("mcp.linear.app");
  });

  test("isConfigured() is always ok (DCR registers a client dynamically)", () => {
    const s = dcrAuth({ mcpServerUrl: "https://mcp.linear.app" });
    expect(s.isConfigured()).toEqual({ ok: true });
  });

  test("two-call flow: REDIRECT then AUTHORIZED, returns persisted bundle", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = dcrAuth({ mcpServerUrl: "https://mcp.linear.app", scope: "read write" });

    let capturedCallbackUrl = "";
    sdkAuthImpl = async (_provider, opts) => {
      if (!opts.authorizationCode) {
        const p = _provider as { redirectUrl: string; state: () => string };
        capturedCallbackUrl = p.redirectUrl;
        const state = p.state();
        setTimeout(() => {
          fetch(`${capturedCallbackUrl}?code=THE_CODE&state=${state}`).catch(() => {});
        }, 5);
        return "REDIRECT";
      }
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

  test("first call returning AUTHORIZED short-circuits to the persisted bundle", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    await tokenStore.set("linear", { access_token: "tok-existing" });
    const strategy = dcrAuth({ mcpServerUrl: "https://mcp.linear.app" });

    sdkAuthImpl = async () => "AUTHORIZED";

    const bundle = await strategy.connect({
      serviceId: "linear",
      tokenStore,
      oauthClientStore,
    });
    expect(bundle.access_token).toBe("tok-existing");
  });

  test("CSRF: callback with wrong state rejects awaitCode and strategy throws", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = dcrAuth({
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
    const strategy = dcrAuth({
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

  test("refresh: returns persisted bundle on AUTHORIZED", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = dcrAuth({ mcpServerUrl: "https://mcp.linear.app" });
    await tokenStore.set("linear", { access_token: "old", refresh_token: "rt-1" });

    sdkAuthImpl = async (_provider) => {
      const p = _provider as {
        saveTokens: (t: { access_token: string; token_type: string; refresh_token?: string }) => Promise<void>;
      };
      await p.saveTokens({ access_token: "fresh", token_type: "Bearer", refresh_token: "rt-2" });
      return "AUTHORIZED";
    };

    const refreshed = await strategy.refresh(
      { access_token: "old", refresh_token: "rt-1" },
      {
        serviceId: "linear",
        tokenStore,
        oauthClientStore,
      },
    );
    expect(refreshed.access_token).toBe("fresh");
    expect(refreshed.refresh_token).toBe("rt-2");
  });

  test("refresh: throws AuthRefreshFailedError when SDK falls through to REDIRECT", async () => {
    const { tokenStore, oauthClientStore } = makeOpts();
    const strategy = dcrAuth({ mcpServerUrl: "https://mcp.linear.app" });

    sdkAuthImpl = async (provider) => {
      // Simulate the SDK trying to open a browser (refresh exhausted) — our
      // openBrowser stub in dcr.refresh throws AuthRefreshFailedError.
      const p = provider as { redirectToAuthorization: (url: URL) => Promise<void> };
      await p.redirectToAuthorization(new URL("https://mcp.linear.app/oauth"));
      return "REDIRECT"; // unreachable; redirectToAuthorization throws
    };

    await expect(
      strategy.refresh(
        { access_token: "old", refresh_token: "rt-1" },
        { serviceId: "linear", tokenStore, oauthClientStore },
      ),
    ).rejects.toMatchObject({ name: "AuthRefreshFailedError" });
  });
});
