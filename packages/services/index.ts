/**
 * tensor-mcp service registry — all supported third-party services live here.
 *
 * Adding a service:
 *   1. Vendor the Klavis MCP server under `vendored/<id>/` (see vendored/README.md)
 *   2. Add an entry to the SERVICES record below
 *   3. Run `tensor-mcp connect <id>` to OAuth + auto-ingest tools
 *
 * Auth strategies (from `@tensor-mcp/core`):
 *   - `mcpDcrAuth({mcpServerUrl, scope?})` — RFC 7591 Dynamic Client
 *     Registration. Browser-based OAuth, no app registration needed.
 *     Works for: Linear, Notion, Atlassian, Asana, Cloudflare, Sentry, Cal.com.
 *   - `staticOAuthAuth({authServerUrl, authServerMetadata, clientId, ...})` —
 *     OAuth 2.1 against a vendor that issues a static client (Slack, Gmail).
 *     Requires one-time OAuth app registration with the vendor. Ships with
 *     empty `clientId` for services awaiting registration; `connect` errors
 *     with a helpful "register at X, set TENSOR_MCP_<SVC>_CLIENT_ID env" message.
 *   - `patAuth({tokenUrl, description})` — user pastes a Personal Access
 *     Token. Use for vendors without DCR or static OAuth (GitHub).
 *   - `apiKeyAuth({signupUrl, description})` — same UX as PAT, framed as
 *     "API key" for vendors that issue long-lived keys.
 *
 * Spawn descriptors (from `@tensor-mcp/core`):
 *   - `klavisPython("vendored/<id>")` — `uv run python server.py --port {{PORT}}`
 *   - `klavisTypescript("vendored/<id>")` — `bun run index.ts` with PORT env
 *   - Or write the SpawnConfig literally for services that don't fit either
 *     convention (e.g. `go run server.go` or a pre-compiled binary).
 */

import {
  type AuthorizationServerMetadata,
  defineService,
  klavisPython,
  klavisTypescript,
  mcpDcrAuth,
  patAuth,
  type Service,
  staticOAuthAuth,
} from "@tensor-mcp/core";

// ---- Static OAuth metadata — hardcoded to skip RFC 9728 + RFC 8414 discovery.

const SLACK_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://slack.com",
  authorization_endpoint: "https://slack.com/oauth/v2/authorize",
  token_endpoint: "https://slack.com/api/oauth.v2.access",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
  ],
};

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

export const SERVICES: Record<string, Service> = {
  linear: defineService({
    id: "linear",
    displayName: "Linear",
    auth: mcpDcrAuth({
      mcpServerUrl: "https://mcp.linear.app",
      scope: "read write",
    }),
    spawn: klavisPython("vendored/linear"),
  }),

  notion: defineService({
    id: "notion",
    displayName: "Notion",
    auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.notion.com" }),
    spawn: klavisPython("vendored/notion"),
  }),

  jira: defineService({
    id: "jira",
    displayName: "Jira (Atlassian)",
    auth: mcpDcrAuth({
      mcpServerUrl: "https://mcp.atlassian.com",
      scope: "read:jira-work write:jira-work read:jira-user",
    }),
    spawn: klavisTypescript("vendored/jira"),
  }),

  slack: defineService({
    id: "slack",
    displayName: "Slack",
    auth: staticOAuthAuth({
      authServerUrl: "https://slack.com",
      authServerMetadata: SLACK_AS_METADATA,
      clientId: process.env.TENSOR_MCP_SLACK_CLIENT_ID ?? "",
      clientSecret: process.env.TENSOR_MCP_SLACK_CLIENT_SECRET,
      scope:
        "chat:write,channels:read,channels:history,users:read,search:read.public",
      registerAppUrl: "https://api.slack.com/apps",
      description:
        "Opens a browser to install the Slack app into your workspace.",
    }),
    spawn: klavisPython("vendored/slack", {
      forgeAuthData: (b) => ({
        access_token: b.access_token,
        authed_user: {
          access_token: b.metadata?.slack_user_token ?? "",
        },
      }),
    }),
  }),

  gmail: defineService({
    id: "gmail",
    displayName: "Gmail",
    auth: staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: GOOGLE_AS_METADATA,
      clientId: process.env.TENSOR_MCP_GMAIL_CLIENT_ID ?? "",
      clientSecret: process.env.TENSOR_MCP_GMAIL_CLIENT_SECRET,
      scope: "https://www.googleapis.com/auth/gmail.modify",
      registerAppUrl: "https://console.cloud.google.com/apis/credentials",
      description: "Opens a browser to sign in with your Google account.",
    }),
    spawn: klavisTypescript("vendored/gmail"),
  }),

  github: defineService({
    id: "github",
    displayName: "GitHub",
    auth: patAuth({
      tokenUrl:
        "https://github.com/settings/tokens/new?scopes=repo,read:org,read:user",
      description: "Scopes needed: repo, read:org, read:user",
    }),
    spawn: {
      vendorDir: "vendored/github",
      command: ["go", "run", "server.go"],
      envInject: { PORT: "{{PORT}}" },
    },
  }),
};

export function getService(id: string): Service | undefined {
  return SERVICES[id];
}

export function listServices(): Service[] {
  return Object.values(SERVICES);
}

/**
 * Services that can be connected today vs. those waiting on configuration
 * (e.g. a static OAuth client_id env var that hasn't been set yet).
 */
export function listConnectableServices(): Service[] {
  return listServices().filter(
    (s) =>
      !s.auth.describe().instructions.toLowerCase().includes("not configured"),
  );
}
