import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { AuthRefreshFailedError } from "../src/auth/errors";
import { oauth, type OAuthConfig } from "../src/auth/oauth";
import type { KeyValueStore, TokenBundle } from "../src/stores/types";

const FAKE_AS: AuthorizationServerMetadata = {
  issuer: "https://example.com",
  authorization_endpoint: "https://example.com/oauth/authorize",
  token_endpoint: "https://example.com/oauth/token",
  response_types_supported: ["code"],
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
    return Array.from(this.#data.entries()).map(([key, value]) => ({ key, value }));
  }
}

// Capture both the auth URL the strategy tries to open AND every fetch
// the strategy makes against the token endpoint. The fetch mock returns
// canned responses; the real loopback callback server is started by
// `connect()` and we fire the callback request from openBrowser to make
// `awaitCode` resolve.

interface RecordedFetch {
  url: string;
  init: RequestInit | undefined;
}

let realFetch: typeof fetch;
let fetchResponder: (
  url: string,
  init?: RequestInit,
) => Promise<Response>;
let fetchCalls: RecordedFetch[] = [];

beforeEach(() => {
  realFetch = globalThis.fetch;
  fetchCalls = [];
  fetchResponder = async () => new Response("not mocked", { status: 500 });

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    // Loopback callback hits the real server — pass through.
    if (url.startsWith("http://127.0.0.1:")) {
      return await realFetch(input, init);
    }
    fetchCalls.push({ url, init });
    return await fetchResponder(url, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function makeStores() {
  return {
    tokenStore: new InlineMemoryStore<TokenBundle>(),
    oauthClientStore: new InlineMemoryStore<OAuthClientInformationFull>(),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Common config — tests override fields they care about.
function configWith(overrides: Partial<OAuthConfig> = {}): OAuthConfig {
  return {
    authServerMetadata: FAKE_AS,
    clientId: "client-abc",
    scope: "read write",
    ...overrides,
  };
}

describe("oauth — describe + isConfigured", () => {
  test("method tag is 'oauth'", () => {
    const s = oauth(configWith());
    expect(s.method).toBe("oauth");
  });

  test("isConfigured() returns ok when clientId is set", () => {
    const s = oauth(configWith({ clientId: "x" }));
    expect(s.isConfigured()).toEqual({ ok: true });
  });

  test("isConfigured() reports not-ok + hint when clientId is empty", () => {
    const s = oauth(
      configWith({
        clientId: "",
        registerAppUrl: "https://example.com/apps/new",
      }),
    );
    const status = s.isConfigured();
    expect(status.ok).toBe(false);
    if (!status.ok) {
      expect(status.reason).toMatch(/not configured/i);
      expect(status.reason).toContain("https://example.com/apps/new");
    }
  });

  test("describe() with empty clientId surfaces the configuration hint", () => {
    const s = oauth(configWith({ clientId: "", registerAppUrl: "https://x" }));
    expect(s.describe().instructions).toMatch(/not configured/i);
  });

  test("describe() with custom description wins over default prose", () => {
    const s = oauth(configWith({ description: "Sign in with Example." }));
    expect(s.describe().instructions).toBe("Sign in with Example.");
  });
});

describe("oauth — connect", () => {
  test("end-to-end: builds auth URL, exchanges code, persists bundle", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(
      configWith({
        clientId: "cli-1",
        clientSecret: "sec-1",
        scope: "read write",
      }),
    );

    fetchResponder = async () =>
      jsonResponse({
        access_token: "at-1",
        refresh_token: "rt-1",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "read write",
      });

    let observedAuthUrl = "";
    const openBrowser = async (url: string): Promise<void> => {
      observedAuthUrl = url;
      const u = new URL(url);
      const state = u.searchParams.get("state");
      const redirect = u.searchParams.get("redirect_uri");
      setTimeout(() => {
        fetch(`${redirect}?code=CODE_OK&state=${state}`).catch(() => {});
      }, 5);
    };

    const bundle = await strategy.connect({
      serviceId: "gmail",
      tokenStore,
      oauthClientStore,
      io: { openBrowser },
    });

    expect(bundle.access_token).toBe("at-1");
    expect(bundle.refresh_token).toBe("rt-1");
    expect(bundle.scopes).toEqual(["read", "write"]);
    expect(typeof bundle.expires_at).toBe("number");

    // Auth URL: PKCE + standard params present.
    const u = new URL(observedAuthUrl);
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cli-1");
    expect(u.searchParams.get("scope")).toBe("read write");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")?.length ?? 0).toBeGreaterThan(20);
    expect(u.searchParams.get("state")?.length ?? 0).toBeGreaterThan(10);
    expect(u.searchParams.get("redirect_uri")).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/callback$/,
    );

    // Token POST: form-encoded body with code_verifier + client_secret.
    expect(fetchCalls).toHaveLength(1);
    const call = fetchCalls[0]!;
    expect(call.url).toBe(FAKE_AS.token_endpoint);
    const body = new URLSearchParams(call.init?.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("CODE_OK");
    expect(body.get("client_id")).toBe("cli-1");
    expect(body.get("client_secret")).toBe("sec-1");
    expect(body.get("code_verifier")?.length ?? 0).toBeGreaterThan(20);
  });

  test("scopeParam: Slack-style — sends 'user_scope' instead of 'scope'", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(
      configWith({ scope: "chat:write", scopeParam: "user_scope" }),
    );

    fetchResponder = async () =>
      jsonResponse({ access_token: "at", token_type: "Bearer" });

    let observedAuthUrl = "";
    const openBrowser = async (url: string): Promise<void> => {
      observedAuthUrl = url;
      const u = new URL(url);
      setTimeout(() => {
        fetch(
          `${u.searchParams.get("redirect_uri")}?code=C&state=${u.searchParams.get("state")}`,
        ).catch(() => {});
      }, 5);
    };

    await strategy.connect({
      serviceId: "slack",
      tokenStore,
      oauthClientStore,
      io: { openBrowser },
    });

    const u = new URL(observedAuthUrl);
    expect(u.searchParams.get("user_scope")).toBe("chat:write");
    expect(u.searchParams.get("scope")).toBeNull();
  });

  test("extraAuthParams: Google-style — appends access_type + prompt", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(
      configWith({
        extraAuthParams: { access_type: "offline", prompt: "consent" },
      }),
    );

    fetchResponder = async () =>
      jsonResponse({ access_token: "at", token_type: "Bearer" });

    let observedUrl = "";
    await strategy.connect({
      serviceId: "gmail",
      tokenStore,
      oauthClientStore,
      io: {
        openBrowser: async (url) => {
          observedUrl = url;
          const u = new URL(url);
          setTimeout(() => {
            fetch(
              `${u.searchParams.get("redirect_uri")}?code=C&state=${u.searchParams.get("state")}`,
            ).catch(() => {});
          }, 5);
        },
      },
    });

    const u = new URL(observedUrl);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
  });

  test("tokenRequestHeaders: GitHub-style — Accept: application/json passes through", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(
      configWith({ tokenRequestHeaders: { Accept: "application/json" } }),
    );

    fetchResponder = async () =>
      jsonResponse({ access_token: "at-gh", token_type: "Bearer" });

    await strategy.connect({
      serviceId: "github",
      tokenStore,
      oauthClientStore,
      io: {
        openBrowser: async (url) => {
          const u = new URL(url);
          setTimeout(() => {
            fetch(
              `${u.searchParams.get("redirect_uri")}?code=C&state=${u.searchParams.get("state")}`,
            ).catch(() => {});
          }, 5);
        },
      },
    });

    expect(fetchCalls).toHaveLength(1);
    const headers = fetchCalls[0]!.init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
    // Default accept stays as fallback if no override.
    expect(headers["content-type"]).toBe("application/x-www-form-urlencoded");
  });

  test("parseTokenResponse: Slack-style — extracts authed_user.access_token + metadata", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(
      configWith({
        parseTokenResponse: (raw) => {
          const authedUser = raw.authed_user as Record<string, unknown>;
          const team = raw.team as Record<string, unknown>;
          return {
            tokens: {
              access_token: authedUser.access_token as string,
              scope: authedUser.scope as string,
            },
            metadata: {
              slack_user_id: String(authedUser.id),
              slack_team_id: String(team.id),
            },
          };
        },
      }),
    );

    fetchResponder = async () =>
      jsonResponse({
        ok: true,
        authed_user: {
          id: "U123",
          access_token: "xoxp-USER-TOKEN",
          scope: "chat:write",
        },
        team: { id: "T456", name: "Felafax" },
      });

    const bundle = await strategy.connect({
      serviceId: "slack",
      tokenStore,
      oauthClientStore,
      io: {
        openBrowser: async (url) => {
          const u = new URL(url);
          setTimeout(() => {
            fetch(
              `${u.searchParams.get("redirect_uri")}?code=C&state=${u.searchParams.get("state")}`,
            ).catch(() => {});
          }, 5);
        },
      },
    });

    expect(bundle.access_token).toBe("xoxp-USER-TOKEN");
    expect(bundle.metadata?.slack_user_id).toBe("U123");
    expect(bundle.metadata?.slack_team_id).toBe("T456");
  });

  test("connect with empty clientId throws AuthNotConfiguredError before opening a browser", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(configWith({ clientId: "" }));
    const opens: string[] = [];
    await expect(
      strategy.connect({
        serviceId: "gmail",
        tokenStore,
        oauthClientStore,
        io: { openBrowser: async (url) => { opens.push(url); } },
      }),
    ).rejects.toThrow(/not configured/i);
    expect(opens).toEqual([]);
  });
});

describe("oauth — refresh", () => {
  test("happy path: POSTs refresh_token grant, persists new bundle, keeps prior refresh_token if response omits it", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(configWith({ clientSecret: "sec-1" }));

    fetchResponder = async () =>
      jsonResponse({
        access_token: "at-fresh",
        expires_in: 3600,
        token_type: "Bearer",
        // Note: no refresh_token in response (Google-style).
      });

    const refreshed = await strategy.refresh(
      { access_token: "old", refresh_token: "rt-keep" },
      { serviceId: "gmail", tokenStore, oauthClientStore },
    );

    expect(refreshed.access_token).toBe("at-fresh");
    expect(refreshed.refresh_token).toBe("rt-keep");
    expect(typeof refreshed.expires_at).toBe("number");

    // Persisted to the store.
    const persisted = await tokenStore.get("gmail");
    expect(persisted?.access_token).toBe("at-fresh");

    expect(fetchCalls).toHaveLength(1);
    const body = new URLSearchParams(fetchCalls[0]!.init?.body as string);
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-keep");
    expect(body.get("client_id")).toBe("client-abc");
    expect(body.get("client_secret")).toBe("sec-1");
  });

  test("no refresh_token stored: throws AuthRefreshFailedError without hitting the network", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(configWith());

    await expect(
      strategy.refresh(
        { access_token: "old" },
        { serviceId: "gmail", tokenStore, oauthClientStore },
      ),
    ).rejects.toBeInstanceOf(AuthRefreshFailedError);
    expect(fetchCalls).toHaveLength(0);
  });

  test("vendor returns 4xx: throws AuthRefreshFailedError", async () => {
    const { tokenStore, oauthClientStore } = makeStores();
    const strategy = oauth(configWith());

    fetchResponder = async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });

    await expect(
      strategy.refresh(
        { access_token: "old", refresh_token: "rt-bad" },
        { serviceId: "gmail", tokenStore, oauthClientStore },
      ),
    ).rejects.toBeInstanceOf(AuthRefreshFailedError);
  });
});
