import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { connectLinear } from "../src/oauth/flow";

const WELL_KNOWN_URL = "https://test.example.com/.well-known/oauth-authorization-server";
const WK_CONFIG = {
  issuer: "https://test.example.com",
  authorization_endpoint: "https://test.example.com/authorize",
  token_endpoint: "https://test.example.com/token",
  registration_endpoint: "https://test.example.com/register",
  code_challenge_methods_supported: ["S256"],
};

describe("connectLinear", () => {
  let origFetch: typeof fetch;
  beforeEach(() => {
    origFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("completes the full OAuth flow and returns a TokenBlob + client_id", async () => {
    let capturedAuthorizeUrl = "";

    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    globalThis.fetch = mock(async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;

      if (url === WELL_KNOWN_URL) {
        return new Response(JSON.stringify(WK_CONFIG), { status: 200 });
      }
      if (url === WK_CONFIG.registration_endpoint) {
        return new Response(JSON.stringify({ client_id: "dyn_client_123" }), { status: 200 });
      }
      if (url === WK_CONFIG.token_endpoint) {
        const body = new URLSearchParams(init?.body as string);
        expect(body.get("grant_type")).toBe("authorization_code");
        expect(body.get("client_id")).toBe("dyn_client_123");
        expect(body.get("code")).toBe("AUTHCODE_XYZ");
        expect(body.get("code_verifier")).toBeTruthy();
        return new Response(
          JSON.stringify({
            access_token: "lin_access_token",
            refresh_token: "lin_refresh_token",
            token_type: "Bearer",
            expires_in: 86400,
            scope: "read write",
          }),
          { status: 200 },
        );
      }
      // Pass through to real fetch for callback server hits.
      return origFetch(input, init);
      // biome-ignore lint/suspicious/noExplicitAny: cast for mock type
    }) as any;

    const openBrowser = async (url: string) => {
      capturedAuthorizeUrl = url;
      const authUrl = new URL(url);
      const redirectUri = authUrl.searchParams.get("redirect_uri");
      const state = authUrl.searchParams.get("state");
      if (!redirectUri || !state) throw new Error("missing redirect_uri or state");
      await origFetch(`${redirectUri}?code=AUTHCODE_XYZ&state=${state}`);
    };

    const result = await connectLinear({
      wellKnownUrl: WELL_KNOWN_URL,
      openBrowser,
    });

    expect(result.client_id).toBe("dyn_client_123");
    expect(result.blob.access_token).toBe("lin_access_token");
    expect(result.blob.refresh_token).toBe("lin_refresh_token");
    expect(result.blob.scopes).toEqual(["read", "write"]);
    expect(result.blob.expires_at).toBeGreaterThan(Date.now());
    expect(result.blob.expires_at).toBeLessThan(Date.now() + 86400 * 1000 + 1000);

    const authUrl = new URL(capturedAuthorizeUrl);
    expect(authUrl.searchParams.get("response_type")).toBe("code");
    expect(authUrl.searchParams.get("client_id")).toBe("dyn_client_123");
    expect(authUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authUrl.searchParams.get("code_challenge")).toBeTruthy();
    expect(authUrl.searchParams.get("scope")).toBe("read write");
  });

  it("throws if well-known fetch fails", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    globalThis.fetch = mock(async () => new Response("", { status: 500 })) as any;
    await expect(
      connectLinear({
        wellKnownUrl: WELL_KNOWN_URL,
        openBrowser: async () => {},
      }),
    ).rejects.toThrow(/well-known/);
  });

  it("throws if registration_endpoint is missing", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    globalThis.fetch = mock(async (input: any) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === WELL_KNOWN_URL) {
        const cfg: Record<string, unknown> = { ...WK_CONFIG };
        delete cfg.registration_endpoint;
        return new Response(JSON.stringify(cfg), { status: 200 });
      }
      throw new Error("unexpected fetch");
      // biome-ignore lint/suspicious/noExplicitAny: cast for mock type
    }) as any;
    await expect(
      connectLinear({
        wellKnownUrl: WELL_KNOWN_URL,
        openBrowser: async () => {},
      }),
    ).rejects.toThrow(/registration_endpoint/);
  });

  it("throws if token exchange fails", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    globalThis.fetch = mock(async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === WELL_KNOWN_URL) return new Response(JSON.stringify(WK_CONFIG), { status: 200 });
      if (url === WK_CONFIG.registration_endpoint)
        return new Response(JSON.stringify({ client_id: "c" }), { status: 200 });
      if (url === WK_CONFIG.token_endpoint)
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      return origFetch(input, init);
      // biome-ignore lint/suspicious/noExplicitAny: cast for mock type
    }) as any;
    const openBrowser = async (url: string) => {
      const u = new URL(url);
      const redirect = u.searchParams.get("redirect_uri");
      const state = u.searchParams.get("state");
      await origFetch(`${redirect}?code=X&state=${state}`);
    };
    await expect(
      connectLinear({
        wellKnownUrl: WELL_KNOWN_URL,
        openBrowser,
      }),
    ).rejects.toThrow(/token exchange|invalid_grant|400/i);
  });

  it("handles missing optional fields gracefully", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test mock signature
    globalThis.fetch = mock(async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === WELL_KNOWN_URL) return new Response(JSON.stringify(WK_CONFIG), { status: 200 });
      if (url === WK_CONFIG.registration_endpoint)
        return new Response(JSON.stringify({ client_id: "c" }), { status: 200 });
      if (url === WK_CONFIG.token_endpoint)
        return new Response(
          JSON.stringify({
            access_token: "tok",
            token_type: "Bearer",
          }),
          { status: 200 },
        );
      return origFetch(input, init);
      // biome-ignore lint/suspicious/noExplicitAny: cast for mock type
    }) as any;
    const openBrowser = async (url: string) => {
      const u = new URL(url);
      const redirect = u.searchParams.get("redirect_uri");
      const state = u.searchParams.get("state");
      await origFetch(`${redirect}?code=X&state=${state}`);
    };
    const r = await connectLinear({
      wellKnownUrl: WELL_KNOWN_URL,
      openBrowser,
    });
    expect(r.blob.access_token).toBe("tok");
    expect(r.blob.refresh_token).toBeUndefined();
    expect(r.blob.expires_at).toBeUndefined();
    expect(r.blob.scopes).toBeUndefined();
  });
});
