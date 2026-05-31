/**
 * tensor-mcp service registry — every supported third-party service lives here.
 *
 * Adding a service:
 *   1. Vendor the Klavis MCP server under `vendored/<id>/` (see vendored/README.md)
 *   2. Add an entry to the SERVICES record below
 *   3. Run `tensor-mcp connect <id>` to OAuth + auto-ingest tools
 *
 * Auth strategies (from `@tensor-mcp/core`):
 *   - `mcpDcrAuth({mcpServerUrl, scope?})` — RFC 7591 Dynamic Client Registration
 *     against a vendor-hosted MCP. Browser-based, no app registration on our
 *     side. Works for: Linear, Notion, Atlassian (Jira/Confluence), Asana,
 *     Cloudflare, Sentry, Cal.com.
 *   - `staticOAuthAuth({authServerUrl, authServerMetadata, clientId, ...})` —
 *     OAuth 2.1 against a vendor that issues a static client. Ships with
 *     `clientId: process.env.TENSOR_MCP_<SVC>_CLIENT_ID ?? ""` — empty
 *     string triggers a friendly "not configured" error before any browser
 *     opens. Used for Slack, Gmail, Discord, Dropbox, Google-family,
 *     Outlook, HubSpot.
 *   - `patAuth({tokenUrl, description})` — user pastes a Personal Access Token.
 *     For vendors with neither DCR nor a static-OAuth app on our side (GitHub,
 *     ClickUp, Trello).
 *   - `apiKeyAuth({signupUrl, description})` — same UX as PAT but framed as
 *     "API key" for vendors that issue long-lived keys (Figma, Perplexity,
 *     Tavily, Brave, OpenRouter, Firecrawl).
 *   - `noAuth()` — public APIs that require no credential (HackerNews, etc.).
 *
 * Spawn descriptors (from `@tensor-mcp/core`):
 *   - `klavisPython("vendored/<id>")` — `uv run python server.py --port {{PORT}}`
 *   - `klavisTypescript("vendored/<id>")` — `bun run index.ts` with PORT env
 *   - Or write the SpawnConfig literally for services that don't fit either
 *     convention (e.g. `go run server.go`, or `bun run src/index.ts`).
 */

import {
  apiKeyAuth,
  mcpDcrAuth,
  noAuth,
  patAuth,
  staticOAuthAuth,
} from "./auth";
import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { defineService, type Service } from "./defineService";
import { remoteMcp } from "./transports/remote";
import { klavisPython, klavisTypescript } from "./transports/klavis";
import {
  actions as slackPipedreamActions,
  app as slackPipedreamApp,
} from "./services/local/slack/index.mjs";

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

const MICROSOFT_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://login.microsoftonline.com/common/v2.0",
  authorization_endpoint:
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  token_endpoint: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
  response_types_supported: ["code"],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: [
    "client_secret_post",
    "client_secret_basic",
  ],
};

const DISCORD_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://discord.com",
  authorization_endpoint: "https://discord.com/oauth2/authorize",
  token_endpoint: "https://discord.com/api/oauth2/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};

const DROPBOX_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://www.dropbox.com",
  authorization_endpoint: "https://www.dropbox.com/oauth2/authorize",
  token_endpoint: "https://api.dropboxapi.com/oauth2/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};

const HUBSPOT_AS_METADATA: AuthorizationServerMetadata = {
  issuer: "https://app.hubspot.com",
  authorization_endpoint: "https://app.hubspot.com/oauth/authorize",
  token_endpoint: "https://api.hubapi.com/oauth/v1/token",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
};

const env = (key: string): string => process.env[key] ?? "";

export const SERVICES: Record<string, Service> = {
  // ============================================================
  // DCR — vendor-hosted MCP server with Dynamic Client Registration
  // ============================================================

  // ─── DCR-hosted-MCP vendors ─────────────────────────────────────────────
  // The DCR token issued by mcp.<vendor>.com is scoped only to that hosted
  // MCP, NOT to the vendor's regular REST/GraphQL API. So we skip the
  // local Klavis subprocess and talk to the vendor's hosted MCP directly,
  // attaching the token as a Bearer header per request.
  linear: defineService({
    id: "linear",
    displayName: "Linear",
    auth: mcpDcrAuth({
      mcpServerUrl: "https://mcp.linear.app",
      scope: "read write",
    }),
    remote: remoteMcp("https://mcp.linear.app/mcp"),
  }),

  notion: defineService({
    id: "notion",
    displayName: "Notion",
    auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.notion.com" }),
    remote: remoteMcp("https://mcp.notion.com/mcp"),
  }),

  jira: defineService({
    id: "jira",
    displayName: "Jira (Atlassian)",
    auth: mcpDcrAuth({
      mcpServerUrl: "https://mcp.atlassian.com",
      scope: "read:jira-work write:jira-work read:jira-user",
    }),
    remote: remoteMcp("https://mcp.atlassian.com/v1/sse"),
  }),

  confluence: defineService({
    id: "confluence",
    displayName: "Confluence (Atlassian)",
    auth: mcpDcrAuth({
      mcpServerUrl: "https://mcp.atlassian.com",
      scope:
        "read:confluence-content.all write:confluence-content read:confluence-user",
    }),
    remote: remoteMcp("https://mcp.atlassian.com/v1/sse"),
  }),

  asana: defineService({
    id: "asana",
    displayName: "Asana",
    auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.asana.com" }),
    remote: remoteMcp("https://mcp.asana.com/sse"),
  }),

  cal_com: defineService({
    id: "cal_com",
    displayName: "Cal.com",
    auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.cal.com" }),
    remote: remoteMcp("https://mcp.cal.com/mcp"),
  }),

  // ============================================================
  // Static OAuth — vendor-registered client_id required.
  // Empty TENSOR_MCP_<SVC>_CLIENT_ID env triggers a friendly
  // "not configured" error before any browser opens.
  // ============================================================

  slack: defineService({
    id: "slack",
    displayName: "Slack",
    auth: staticOAuthAuth({
      authServerUrl: "https://slack.com",
      authServerMetadata: SLACK_AS_METADATA,
      clientId: env("TENSOR_MCP_SLACK_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_SLACK_CLIENT_SECRET,
      scope:
        "chat:write,channels:read,channels:history,users:read,search:read.public",
      registerAppUrl: "https://api.slack.com/apps",
      description:
        "Opens a browser to install the Slack app into your workspace.",
    }),
    pipedream: {
      app: slackPipedreamApp,
      actions: slackPipedreamActions,
      authAliases: {
        // Pipedream's slack_v2 component reads `oauth_access_token` for user
        // calls and `bot_token` for bot calls. tensor-mcp's OAuth bundle
        // stores the user token as `access_token`; the bot token rides in
        // metadata when the install yields one.
        oauth_access_token: (b) => b.access_token,
        bot_token: (b) =>
          b.metadata?.bot_token ?? b.metadata?.slack_bot_token ?? "",
        oauth_uid: (b) => b.metadata?.slack_user_id ?? "",
        base_url: () => "https://slack.com/api/",
      },
    },
  }),

  gmail: defineService({
    id: "gmail",
    displayName: "Gmail",
    auth: staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: GOOGLE_AS_METADATA,
      clientId: env("TENSOR_MCP_GMAIL_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_GMAIL_CLIENT_SECRET,
      scope: "https://www.googleapis.com/auth/gmail.modify",
      registerAppUrl: "https://console.cloud.google.com/apis/credentials",
    }),
    spawn: klavisTypescript("vendored/gmail"),
  }),

  google_drive: defineService({
    id: "google_drive",
    displayName: "Google Drive",
    auth: staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: GOOGLE_AS_METADATA,
      clientId: env("TENSOR_MCP_GOOGLE_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_GOOGLE_CLIENT_SECRET,
      scope: "https://www.googleapis.com/auth/drive",
    }),
    spawn: klavisPython("vendored/google_drive"),
  }),

  google_docs: defineService({
    id: "google_docs",
    displayName: "Google Docs",
    auth: staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: GOOGLE_AS_METADATA,
      clientId: env("TENSOR_MCP_GOOGLE_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_GOOGLE_CLIENT_SECRET,
      scope: "https://www.googleapis.com/auth/documents",
    }),
    spawn: klavisPython("vendored/google_docs"),
  }),

  google_sheets: defineService({
    id: "google_sheets",
    displayName: "Google Sheets",
    auth: staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: GOOGLE_AS_METADATA,
      clientId: env("TENSOR_MCP_GOOGLE_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_GOOGLE_CLIENT_SECRET,
      scope: "https://www.googleapis.com/auth/spreadsheets",
    }),
    spawn: klavisPython("vendored/google_sheets"),
  }),

  google_calendar: defineService({
    id: "google_calendar",
    displayName: "Google Calendar",
    auth: staticOAuthAuth({
      authServerUrl: "https://accounts.google.com",
      authServerMetadata: GOOGLE_AS_METADATA,
      clientId: env("TENSOR_MCP_GOOGLE_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_GOOGLE_CLIENT_SECRET,
      scope: "https://www.googleapis.com/auth/calendar",
    }),
    spawn: klavisPython("vendored/google_calendar"),
  }),

  outlook: defineService({
    id: "outlook",
    displayName: "Outlook",
    auth: staticOAuthAuth({
      authServerUrl: "https://login.microsoftonline.com/common/v2.0",
      authServerMetadata: MICROSOFT_AS_METADATA,
      clientId: env("TENSOR_MCP_MICROSOFT_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_MICROSOFT_CLIENT_SECRET,
      scope:
        "https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access",
    }),
    spawn: klavisPython("vendored/outlook"),
  }),

  discord: defineService({
    id: "discord",
    displayName: "Discord",
    auth: staticOAuthAuth({
      authServerUrl: "https://discord.com",
      authServerMetadata: DISCORD_AS_METADATA,
      clientId: env("TENSOR_MCP_DISCORD_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_DISCORD_CLIENT_SECRET,
      scope: "identify guilds messages.read",
    }),
    spawn: klavisPython("vendored/discord"),
  }),

  dropbox: defineService({
    id: "dropbox",
    displayName: "Dropbox",
    auth: staticOAuthAuth({
      authServerUrl: "https://www.dropbox.com",
      authServerMetadata: DROPBOX_AS_METADATA,
      clientId: env("TENSOR_MCP_DROPBOX_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_DROPBOX_CLIENT_SECRET,
    }),
    // Klavis ships dropbox with `src/index.ts`, not the convention `index.ts`.
    spawn: {
      vendorDir: "vendored/dropbox",
      command: ["bun", "run", "src/index.ts"],
      envInject: { PORT: "{{PORT}}" },
    },
  }),

  hubspot: defineService({
    id: "hubspot",
    displayName: "HubSpot",
    auth: staticOAuthAuth({
      authServerUrl: "https://app.hubspot.com",
      authServerMetadata: HUBSPOT_AS_METADATA,
      clientId: env("TENSOR_MCP_HUBSPOT_CLIENT_ID"),
      clientSecret: process.env.TENSOR_MCP_HUBSPOT_CLIENT_SECRET,
      scope: "crm.objects.contacts.read crm.objects.contacts.write",
    }),
    spawn: klavisPython("vendored/hubspot"),
  }),

  // ============================================================
  // PAT / API key — user pastes a long-lived credential.
  // ============================================================

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

  clickup: defineService({
    id: "clickup",
    displayName: "ClickUp",
    auth: patAuth({
      tokenUrl: "https://app.clickup.com/settings/apps",
      description: "Generate a Personal Token under Apps → API Token.",
    }),
    spawn: klavisPython("vendored/clickup"),
  }),

  trello: defineService({
    id: "trello",
    displayName: "Trello",
    auth: patAuth({
      tokenUrl: "https://trello.com/power-ups/admin",
      description: "Generate an API key + token from your Trello workspace.",
    }),
    spawn: klavisPython("vendored/trello"),
  }),

  figma: defineService({
    id: "figma",
    displayName: "Figma",
    auth: apiKeyAuth({
      signupUrl: "https://www.figma.com/developers/api#access-tokens",
      description: "Generate a Personal Access Token in Figma settings.",
    }),
    spawn: klavisPython("vendored/figma"),
  }),

  perplexity_ai: defineService({
    id: "perplexity_ai",
    displayName: "Perplexity AI",
    auth: apiKeyAuth({
      signupUrl: "https://www.perplexity.ai/settings/api",
      description: "Generate an API key under your Perplexity account.",
    }),
    spawn: klavisPython("vendored/perplexity_ai"),
  }),

  tavily: defineService({
    id: "tavily",
    displayName: "Tavily Search",
    auth: apiKeyAuth({
      signupUrl: "https://app.tavily.com/home",
      description: "Sign up + grab the API key from your dashboard.",
    }),
    spawn: klavisPython("vendored/tavily"),
  }),

  brave_search: defineService({
    id: "brave_search",
    displayName: "Brave Search",
    auth: apiKeyAuth({
      signupUrl: "https://api.search.brave.com/app/keys",
      description: "Sign up to Brave Search API and create a key.",
    }),
    spawn: klavisPython("vendored/brave_search"),
  }),

  openrouter: defineService({
    id: "openrouter",
    displayName: "OpenRouter",
    auth: apiKeyAuth({
      signupUrl: "https://openrouter.ai/settings/keys",
      description: "Create an API key in OpenRouter settings.",
    }),
    spawn: klavisPython("vendored/openrouter"),
  }),

  firecrawl: defineService({
    id: "firecrawl",
    displayName: "Firecrawl",
    auth: apiKeyAuth({
      signupUrl: "https://www.firecrawl.dev/app/api-keys",
      description: "Sign up and create an API key.",
    }),
    spawn: klavisTypescript("vendored/firecrawl"),
  }),

  // ============================================================
  // No auth — public APIs.
  // ============================================================

  hacker_news: defineService({
    id: "hacker_news",
    displayName: "Hacker News",
    auth: noAuth(),
    spawn: klavisPython("vendored/hacker_news"),
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
