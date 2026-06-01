import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { oauth, type AuthStrategy } from "../../auth";

/**
 * Shared Google Cloud OAuth configuration for every tensor-mcp Google
 * service (Gmail, Calendar, Drive, Docs, Sheets, Meet, …).
 *
 * Single Google project, single Desktop App OAuth client, different
 * scope per service. Users `tensor-mcp connect gmail` once and the
 * Google product they picked is wired — no per-service env-var dance.
 *
 * `googleOAuth({ scope })` is the one entry point every Google service
 * uses; constants live in this file so swapping the project (or rotating
 * the secret) is a one-touch update.
 *
 * To use your own Google Cloud project: fork tensor-mcp and replace
 * GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET below. We deliberately don't
 * expose env-var overrides — the shipped client is the whole point of
 * the OSS distribution and forking is a clearer signal of intent than
 * a runtime knob that almost nobody flips.
 *
 * Note on the "secret": this is a Google "Desktop App" OAuth client.
 * Google designs this client type to be shipped in distributed apps
 * (gcloud, supabase-cli, etc. all do this) — PKCE handles the actual
 * auth security; the "secret" is just a registered identifier.
 */

const GOOGLE_AS_METADATA: AuthorizationServerMetadata = {
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

const GOOGLE_CLIENT_ID =
  "256154400952-sku65ffqs7gsla7v35l6ksmunlcs8mhc.apps.googleusercontent.com";

const GOOGLE_CLIENT_SECRET = "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";

/**
 * The two extra URL params Google requires to mint a refresh_token:
 *   • `access_type=offline` — without it only access_token comes back
 *   • `prompt=consent`      — forces re-issue of refresh_token on
 *     subsequent authorizations (otherwise Google assumes the existing
 *     one is still valid and doesn't re-emit it)
 */
const GOOGLE_OFFLINE_AUTH_PARAMS = {
  access_type: "offline",
  prompt: "consent",
} as const;

export interface GoogleOAuthOptions {
  /**
   * The Google scope (or space-separated scope list) the service needs.
   * Each tensor-mcp Google service picks its own — gmail.modify for
   * Gmail, spreadsheets+drive for Sheets, etc.
   */
  scope: string;
  /** Prose shown at connect-time. Defaults to a generic Google message. */
  description?: string;
}

/**
 * Build a shared-config Google OAuth strategy for one Google service.
 * The only per-service knob is `scope` — everything else (client_id,
 * client_secret, AS metadata, offline-auth params, register-URL hint)
 * is the same for every Google product.
 */
export function googleOAuth(opts: GoogleOAuthOptions): AuthStrategy {
  return oauth({
    authServerMetadata: GOOGLE_AS_METADATA,
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    scope: opts.scope,
    extraAuthParams: GOOGLE_OFFLINE_AUTH_PARAMS,
    registerAppUrl: "https://console.cloud.google.com/apis/credentials",
    description:
      opts.description ?? "Opens a browser to authorize via Google.",
  });
}
