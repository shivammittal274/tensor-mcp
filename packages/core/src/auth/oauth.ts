import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { TokenBundle } from "../stores/types";
import { startCallbackServer } from "./callback";
import {
  AuthNotConfiguredError,
  AuthRefreshFailedError,
} from "./errors";
import {
  codeChallengeS256,
  randomCodeVerifier,
  randomState,
} from "./pkce";
import type {
  AuthStrategy,
  ConnectOptions,
  RefreshOptions,
} from "./types";

/**
 * OAuth 2.0 + PKCE against a vendor that issues a static client (Slack,
 * Gmail, GitHub, …). Not for MCP-protocol vendors — those use `dcrAuth`
 * with RFC 7591 dynamic client registration.
 *
 * Vendor quirks are declared as **data**, not callbacks, wherever
 * possible:
 *
 *   • `scopeParam`           — Slack uses `user_scope` for loopback flows
 *                              instead of the standard `scope` parameter.
 *   • `extraAuthParams`      — Google needs `access_type=offline` +
 *                              `prompt=consent` to issue a refresh_token.
 *   • `tokenRequestHeaders`  — GitHub requires `Accept: application/json`
 *                              or it returns form-encoded.
 *   • `redirectPort`         — vendors that reject wildcard redirect ports
 *                              (GitHub, Discord, Notion, …) pin one here;
 *                              the OAuth app must register
 *                              `http://127.0.0.1:<port>/callback`.
 *
 * The one callback escape hatch — `parseTokenResponse` — handles vendors
 * whose token-endpoint response doesn't fit OAuth 2.0 shape (Slack puts
 * the user token under `authed_user.access_token`). Most vendors don't
 * need it.
 *
 * Implementation note: we deliberately don't use the MCP SDK's `auth()`
 * orchestrator for this strategy. The SDK targets MCP-protocol servers
 * and zod-validates responses against the spec — which rejects Slack-
 * style deviations. For random vendor OAuth, owning ~180 LOC of focused
 * code is cleaner than threading callbacks through SDK internals.
 */

export interface OAuthConfig {
  /**
   * Hardcoded auth-server metadata. Only `authorization_endpoint` +
   * `token_endpoint` are required; the rest is unused. Shared constants
   * for popular vendors live in `services/_shared/oauth-metadata.ts`.
   */
  authServerMetadata: AuthorizationServerMetadata;

  /**
   * OAuth `client_id` issued by the vendor. Empty string is treated as
   * "not configured" — `connect` throws `AuthNotConfiguredError` instead
   * of opening a browser to a broken URL.
   */
  clientId: string;

  /**
   * `client_secret` for confidential clients (Google "Web", Microsoft AAD).
   * Omit for public clients (Slack/GitHub/Notion with PKCE-only).
   *
   * Note: shipping a `client_secret` in a desktop app is acceptable for
   * Google's "Desktop App" client type — PKCE is the load-bearing factor;
   * the secret is just a registered identifier.
   */
  clientSecret?: string;

  /** Vendor-specific scope string (space- or comma-separated). */
  scope: string;

  /**
   * Name of the scope parameter on the authorization URL. Default is
   * `"scope"`. Slack's loopback flow requires `"user_scope"` because bot
   * scopes aren't allowed when redirecting to a non-web URI.
   */
  scopeParam?: string;

  /**
   * Extra query parameters appended to the authorization URL. Google needs
   * `{ access_type: "offline", prompt: "consent" }` to issue a
   * refresh_token; without these, only the access_token comes back.
   */
  extraAuthParams?: Record<string, string>;

  /**
   * Extra headers added to the token-endpoint POST. GitHub returns
   * form-encoded by default; setting `{ Accept: "application/json" }`
   * forces JSON. Default content-type stays
   * `application/x-www-form-urlencoded`.
   */
  tokenRequestHeaders?: Record<string, string>;

  /**
   * Fixed loopback port. Set when the vendor's OAuth app config requires
   * an exact-match redirect URI. The user must register
   * `http://127.0.0.1:<port>/callback`. Omit when the vendor accepts
   * wildcard ports (Google "Desktop App" is the only common case).
   */
  redirectPort?: number;

  /**
   * Last-resort reshape for vendors that return non-standard token-endpoint
   * responses. Returns the OAuth-2.0-shaped `tokens` object the rest of
   * the flow expects, plus any sidecar `metadata` (vendor user id, team id,
   * …) merged into the persisted `TokenBundle.metadata`.
   */
  parseTokenResponse?: (raw: Record<string, unknown>) => ParsedTokenResponse;

  /** Where the user registers an OAuth app (used in "not configured" hint). */
  registerAppUrl?: string;

  /** Custom prose for the connect-time instructions. */
  description?: string;

  /** Callback timeout. Default 5 minutes. */
  timeoutMs?: number;
}

/**
 * Subset of the OAuth 2.0 token response we use. Vendors return more
 * (id_token, scope, …) — we ignore those.
 */
export interface ParsedTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

export interface ParsedTokenResponse {
  tokens: ParsedTokens;
  metadata?: Record<string, string>;
}

export function oauth(config: OAuthConfig): AuthStrategy {
  return {
    method: "oauth",

    isConfigured() {
      if (config.clientId) return { ok: true };
      const where = config.registerAppUrl
        ? ` Register one at: ${config.registerAppUrl}.`
        : "";
      return {
        ok: false,
        reason:
          `OAuth client_id not configured.${where} ` +
          `Set TENSOR_MCP_<SERVICE>_CLIENT_ID before running connect.`,
      };
    },

    describe() {
      const status = this.isConfigured();
      if (!status.ok) return { instructions: status.reason };
      return {
        instructions:
          config.description ??
          `Opens a browser to authenticate with ${new URL(config.authServerMetadata.authorization_endpoint).host}.`,
      };
    },

    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const status = this.isConfigured();
      if (!status.ok) {
        throw new AuthNotConfiguredError(opts.serviceId, status.reason);
      }

      const state = randomState();
      const verifier = randomCodeVerifier();
      const challenge = await codeChallengeS256(verifier);

      const callback = await startCallbackServer({
        expectedState: state,
        timeoutMs: config.timeoutMs ?? 300_000,
        port: config.redirectPort,
      });

      try {
        const redirectUri = callback.redirectUri;
        const authUrl = buildAuthUrl(config, {
          state,
          challenge,
          redirectUri,
        });

        const openBrowser = opts.io?.openBrowser ?? defaultOpenBrowser;
        await openBrowser(authUrl.toString());

        const { code } = await callback.awaitCode;

        const tokens = await exchangeCode(config, {
          code,
          redirectUri,
          verifier,
        });
        const bundle = await persistBundle(opts, tokens, undefined);
        return bundle;
      } finally {
        callback.close();
      }
    },

    async refresh(
      bundle: TokenBundle,
      opts: RefreshOptions,
    ): Promise<TokenBundle> {
      if (!bundle.refresh_token) {
        throw new AuthRefreshFailedError(
          opts.serviceId,
          "no refresh_token stored — vendor doesn't issue one, or initial connect predated refresh support",
        );
      }
      const tokens = await refreshTokens(
        config,
        bundle.refresh_token,
        opts.serviceId,
      );
      return await persistBundle(
        {
          serviceId: opts.serviceId,
          tokenStore: opts.tokenStore,
          // Reuse the same persist helper as connect; it doesn't touch oauthClientStore.
          oauthClientStore: opts.oauthClientStore,
        } as ConnectOptions,
        tokens,
        bundle,
      );
    },
  };
}

// ─── Authorization URL ───────────────────────────────────────────────────────

function buildAuthUrl(
  config: OAuthConfig,
  args: { state: string; challenge: string; redirectUri: string },
): URL {
  const url = new URL(config.authServerMetadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const scopeParam = config.scopeParam ?? "scope";
  url.searchParams.set(scopeParam, config.scope);

  for (const [key, value] of Object.entries(config.extraAuthParams ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

// ─── Token endpoint exchange ────────────────────────────────────────────────

async function exchangeCode(
  config: OAuthConfig,
  args: { code: string; redirectUri: string; verifier: string },
): Promise<ParsedTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: config.clientId,
    code_verifier: args.verifier,
  });
  if (config.clientSecret) body.set("client_secret", config.clientSecret);
  return await postTokenRequest(config, body);
}

async function refreshTokens(
  config: OAuthConfig,
  refreshToken: string,
  serviceId: string,
): Promise<ParsedTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: config.clientId,
  });
  if (config.clientSecret) body.set("client_secret", config.clientSecret);
  try {
    return await postTokenRequest(config, body);
  } catch (err) {
    throw new AuthRefreshFailedError(
      serviceId,
      (err as Error).message,
      err,
    );
  }
}

async function postTokenRequest(
  config: OAuthConfig,
  body: URLSearchParams,
): Promise<ParsedTokenResponse> {
  const res = await fetch(config.authServerMetadata.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      ...config.tokenRequestHeaders,
    },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`token endpoint returned ${res.status}: ${text}`);
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `token endpoint returned non-JSON body (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (config.parseTokenResponse) return config.parseTokenResponse(raw);
  return { tokens: defaultParseTokens(raw) };
}

function defaultParseTokens(raw: Record<string, unknown>): ParsedTokens {
  const access = raw.access_token;
  if (typeof access !== "string" || !access) {
    throw new Error(
      `token endpoint response missing access_token: ${JSON.stringify(raw).slice(0, 200)}`,
    );
  }
  const out: ParsedTokens = { access_token: access };
  if (typeof raw.refresh_token === "string") out.refresh_token = raw.refresh_token;
  if (typeof raw.expires_in === "number") out.expires_in = raw.expires_in;
  if (typeof raw.token_type === "string") out.token_type = raw.token_type;
  if (typeof raw.scope === "string") out.scope = raw.scope;
  return out;
}

// ─── Persist ─────────────────────────────────────────────────────────────────

async function persistBundle(
  opts: ConnectOptions,
  parsed: ParsedTokenResponse,
  prior: TokenBundle | undefined,
): Promise<TokenBundle> {
  const bundle: TokenBundle = { access_token: parsed.tokens.access_token };

  // Refresh-token persistence: if the response has one, use it. If not,
  // carry forward the prior one — many vendors (Google) don't return the
  // refresh_token on subsequent refreshes because it doesn't rotate.
  if (parsed.tokens.refresh_token) {
    bundle.refresh_token = parsed.tokens.refresh_token;
  } else if (prior?.refresh_token) {
    bundle.refresh_token = prior.refresh_token;
  }

  if (typeof parsed.tokens.expires_in === "number") {
    bundle.expires_at = Date.now() + parsed.tokens.expires_in * 1000;
  }

  if (parsed.tokens.scope) {
    const scopes = parsed.tokens.scope.split(/[\s,]+/).filter(Boolean);
    if (scopes.length > 0) bundle.scopes = scopes;
  } else if (prior?.scopes) {
    bundle.scopes = prior.scopes;
  }

  // Merge sidecar metadata: prior wins for keys not in parsed.metadata, so
  // a refresh that doesn't re-emit `slack_user_id` doesn't lose it.
  const mergedMeta: Record<string, string> = {
    ...(prior?.metadata ?? {}),
    ...(parsed.metadata ?? {}),
  };
  if (Object.keys(mergedMeta).length > 0) bundle.metadata = mergedMeta;

  await opts.tokenStore.set(opts.serviceId, bundle);
  return bundle;
}

// ─── Default browser opener ──────────────────────────────────────────────────

async function defaultOpenBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  await Bun.spawn([cmd, url]).exited;
}
