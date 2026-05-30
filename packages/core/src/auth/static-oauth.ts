import { auth as sdkAuth } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  AuthorizationServerMetadata,
  OAuthClientMetadata,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { TokenBundle } from "../stores/types";
import { startCallbackServer } from "./callback";
import { StaticOAuthProvider } from "./static-oauth-provider";
import type { AuthStrategy, ConnectOptions } from "./types";

export interface StaticOAuthConfig {
  /** Hardcoded authorization-server URL (e.g. "https://accounts.google.com"). */
  authServerUrl: string;
  /**
   * Hardcoded authorization-server metadata — bypasses RFC 9728 + RFC 8414
   * discovery. MUST include `response_types_supported: ["code"]` or the SDK
   * crashes in `startAuthorization` (auth.js:693).
   */
  authServerMetadata: AuthorizationServerMetadata;
  /**
   * OAuth client_id issued by the vendor when you registered the app.
   * Empty string is treated as "not yet configured" — `connect` will throw
   * a friendly error pointing at `registerAppUrl` instead of opening a
   * browser to a broken URL.
   */
  clientId: string;
  /** Confidential clients only (Google, Slack). Omit for public clients. */
  clientSecret?: string;
  /** OAuth scope string (vendor-specific). */
  scope?: string;
  /** Shown to the user as the connect-time instructions. */
  description?: string;
  /**
   * Where the user goes to register an OAuth app (used in the "not yet
   * configured" error). Required when clientId can be empty.
   */
  registerAppUrl?: string;
  /** Optional client_name advertised in clientMetadata. */
  clientName?: string;
  /** Callback timeout. Default 5 minutes. */
  timeoutMs?: number;
}

/**
 * OAuth 2.1 against a vendor that issues a static client (not DCR).
 *
 * Usage: register an OAuth app once with the vendor (Slack, Google, etc.),
 * hardcode the `client_id` (+ `client_secret` for confidential clients)
 * and the auth-server metadata into the service definition. End users
 * never see a vendor-app-registration screen — they just click "Allow."
 *
 * Falls back to a friendly error if `clientId` is empty, so the service
 * can ship with `clientId: process.env.TENSOR_MCP_SLACK_CLIENT_ID ?? ""`
 * and remain discoverable in `tensor-mcp show` etc.
 */
export function staticOAuthAuth(config: StaticOAuthConfig): AuthStrategy {
  return {
    method: "oauth-static",
    describe() {
      if (!config.clientId) {
        return {
          instructions: notConfiguredMessage(config),
        };
      }
      const where = new URL(config.authServerUrl).host;
      return {
        instructions:
          config.description ??
          `Opens a browser to authenticate with ${where}.`,
      };
    },
    async connect(opts: ConnectOptions): Promise<TokenBundle> {
      if (!config.clientId) {
        throw new Error(notConfiguredMessage(config));
      }

      const state = randomState();
      const callback = await startCallbackServer({
        expectedState: state,
        timeoutMs: config.timeoutMs ?? 300_000,
      });

      try {
        const redirectUrl = callback.redirectUri;
        const clientMetadata: OAuthClientMetadata = {
          client_name: config.clientName ?? "tensor-mcp",
          redirect_uris: [redirectUrl],
          token_endpoint_auth_method: config.clientSecret
            ? "client_secret_basic"
            : "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        };
        if (config.scope) clientMetadata.scope = config.scope;

        const openBrowser = opts.io?.openBrowser ?? defaultOpenBrowser;
        const provider = new StaticOAuthProvider({
          serviceId: opts.serviceId,
          tokenStore: opts.tokenStore,
          redirectUrl,
          clientMetadata,
          clientInfo: {
            client_id: config.clientId,
            ...(config.clientSecret
              ? { client_secret: config.clientSecret }
              : {}),
          },
          authServerUrl: config.authServerUrl,
          authServerMetadata: config.authServerMetadata,
          state,
          openBrowser,
        });

        // The SDK's auth() runs the orchestrator: discovery (skipped via
        // our discoveryState) → DCR (skipped via our clientInformation) →
        // PKCE + redirect → returns "REDIRECT".
        const r1 = await sdkAuth(provider, {
          serverUrl: config.authServerUrl,
          scope: config.scope,
        });
        if (r1 !== "REDIRECT") {
          throw new Error(`expected REDIRECT, got ${r1}`);
        }

        const { code } = await callback.awaitCode;

        // Round 2: token exchange with the code we just received.
        const r2 = await sdkAuth(provider, {
          serverUrl: config.authServerUrl,
          authorizationCode: code,
          scope: config.scope,
        });
        if (r2 !== "AUTHORIZED") {
          throw new Error(`expected AUTHORIZED, got ${r2}`);
        }

        const bundle = await opts.tokenStore.get(opts.serviceId);
        if (!bundle) {
          throw new Error("auth succeeded but no token bundle persisted");
        }
        return bundle;
      } finally {
        callback.close();
      }
    },
  };
}

function notConfiguredMessage(config: StaticOAuthConfig): string {
  const where = config.registerAppUrl
    ? ` Register one at: ${config.registerAppUrl}`
    : "";
  const envHint =
    " Set the corresponding TENSOR_MCP_<SERVICE>_CLIENT_ID env var (and CLIENT_SECRET if confidential) before running connect.";
  return `OAuth client not configured.${where}${envHint}`;
}

function randomState(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(24))).toString(
    "base64url",
  );
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
