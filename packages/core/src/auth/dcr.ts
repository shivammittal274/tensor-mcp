import { auth as sdkAuth } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { TokenBundle } from "../stores/types";
import { startCallbackServer } from "./callback";
import { AuthRefreshFailedError } from "./errors";
import { randomState } from "./pkce";
import { VaultBackedOAuthProvider } from "./provider";
import type {
  AuthStrategy,
  ConnectOptions,
  RefreshOptions,
} from "./types";

/**
 * Auth strategy for MCP-protocol vendors that support RFC 7591 Dynamic
 * Client Registration (Linear, Notion-MCP, Atlassian, Asana, Cal.com).
 *
 * Uses the MCP SDK's `auth()` orchestrator — it owns the discovery
 * (RFC 9728 + RFC 8414), client registration, PKCE round trip, token
 * exchange, and refresh-token grant. Renamed from `mcp-dcr.ts` to align
 * file with concept: DCR is the MCP-protocol auth path; `oauth.ts` is
 * the vendor-OAuth path.
 */

export interface DcrAuthConfig {
  mcpServerUrl: string;
  scope?: string;
  clientName?: string;
  timeoutMs?: number;
}

export function dcrAuth(config: DcrAuthConfig): AuthStrategy {
  return {
    method: "oauth-dcr",

    isConfigured() {
      // DCR registers a client dynamically at connect-time — no env-var
      // prerequisite. Always runnable.
      return { ok: true };
    },

    describe() {
      return {
        instructions: `Opens a browser to authenticate with ${new URL(config.mcpServerUrl).host}.`,
      };
    },

    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      const state = randomState();
      const callback = await startCallbackServer({
        expectedState: state,
        timeoutMs: config.timeoutMs ?? 300_000,
      });

      try {
        const redirectUrl = callback.redirectUri;
        const clientMetadata = buildClientMetadata(config, redirectUrl);
        const openBrowser = opts.io?.openBrowser ?? defaultOpenBrowser;
        const provider = new VaultBackedOAuthProvider({
          serviceId: opts.serviceId,
          tokenStore: opts.tokenStore,
          oauthClientStore: opts.oauthClientStore,
          redirectUrl,
          clientMetadata,
          state,
          openBrowser,
        });

        const r1 = await sdkAuth(provider, {
          serverUrl: config.mcpServerUrl,
          scope: config.scope,
        });

        // r1 === "AUTHORIZED" means a still-valid token (or refreshed one)
        // was already in the vault — `connect` is being re-run on an
        // already-connected service. Skip the browser/callback dance.
        if (r1 === "AUTHORIZED") {
          const bundle = await opts.tokenStore.get(opts.serviceId);
          if (!bundle) {
            throw new Error("auth reported AUTHORIZED but no token persisted");
          }
          return bundle;
        }
        if (r1 !== "REDIRECT") {
          throw new Error(`expected REDIRECT, got ${r1}`);
        }

        const { code } = await callback.awaitCode;

        const r2 = await sdkAuth(provider, {
          serverUrl: config.mcpServerUrl,
          authorizationCode: code,
          scope: config.scope,
        });
        if (r2 !== "AUTHORIZED") {
          throw new Error(`expected AUTHORIZED, got ${r2}`);
        }

        const bundle = await opts.tokenStore.get(opts.serviceId);
        if (!bundle) throw new Error("auth succeeded but no token bundle persisted");
        return bundle;
      } finally {
        callback.close();
      }
    },

    async refresh(
      _bundle: TokenBundle,
      opts: RefreshOptions,
    ): Promise<TokenBundle> {
      // The SDK's `auth()` reads the stored bundle via `provider.tokens()`;
      // if `expires_in` is ≤ 0 and a `refresh_token` is present, it POSTs
      // the refresh-token grant and persists the new pair via
      // `provider.saveTokens`. If the grant fails the SDK falls through
      // to `redirectToAuthorization` — we override `openBrowser` to throw
      // so that fall-through surfaces as `AuthRefreshFailedError`.
      const provider = new VaultBackedOAuthProvider({
        serviceId: opts.serviceId,
        tokenStore: opts.tokenStore,
        oauthClientStore: opts.oauthClientStore,
        redirectUrl: "http://127.0.0.1:0/callback",
        clientMetadata: buildClientMetadata(config, "http://127.0.0.1:0/callback"),
        state: "refresh-unused",
        openBrowser: async () => {
          throw new AuthRefreshFailedError(
            opts.serviceId,
            "refresh exhausted — interactive re-auth required",
          );
        },
      });

      let result: string;
      try {
        result = await sdkAuth(provider, {
          serverUrl: config.mcpServerUrl,
          scope: config.scope,
        });
      } catch (err) {
        if (err instanceof AuthRefreshFailedError) throw err;
        throw new AuthRefreshFailedError(
          opts.serviceId,
          (err as Error).message,
          err,
        );
      }
      if (result !== "AUTHORIZED") {
        throw new AuthRefreshFailedError(
          opts.serviceId,
          `SDK returned ${result} during refresh`,
        );
      }
      const fresh = await opts.tokenStore.get(opts.serviceId);
      if (!fresh) {
        throw new AuthRefreshFailedError(
          opts.serviceId,
          "refresh succeeded but no bundle persisted",
        );
      }
      return fresh;
    },
  };
}

function buildClientMetadata(
  config: DcrAuthConfig,
  redirectUrl: string,
): OAuthClientMetadata {
  const meta: OAuthClientMetadata = {
    client_name: config.clientName ?? "tensor-mcp",
    redirect_uris: [redirectUrl],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
  if (config.scope) meta.scope = config.scope;
  return meta;
}

async function defaultOpenBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  await Bun.spawn([cmd, url]).exited;
}
