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
 *   - `patAuth({tokenUrl, description})` — user pastes a Personal Access
 *     Token. Use for vendors without DCR (GitHub).
 *   - `apiKeyAuth({signupUrl, description})` — same UX as PAT, framed as
 *     "API key" for vendors that issue long-lived keys.
 *
 * Spawn descriptors (from `@tensor-mcp/core`):
 *   - `klavisPython("vendored/<id>")` — `uv run python server.py --port {{PORT}}`
 *   - `klavisTypescript("vendored/<id>")` — `bun run index.ts` with PORT env
 *   - Or write the SpawnConfig literally for services that don't fit either
 *     convention (e.g. a pre-compiled Go binary with `command: ["./bin/server"]`).
 */

import {
  type AuthStrategy,
  defineService,
  klavisPython,
  klavisTypescript,
  mcpDcrAuth,
  type Service,
} from "@tensor-mcp/core";

/** Placeholder for services whose OAuth client registration is pending. */
function oauthPending(reason: string): AuthStrategy {
  return {
    method: "oauth-dcr",
    describe: () => ({ instructions: `Not yet wired — ${reason}` }),
    connect: async () => {
      throw new Error(`Not yet wired — ${reason}`);
    },
  };
}

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
    auth: oauthPending("Slack OAuth App registration"),
    spawn: klavisPython("vendored/slack"),
  }),

  gmail: defineService({
    id: "gmail",
    displayName: "Gmail",
    auth: oauthPending("Google Cloud project + OAuth verification"),
    spawn: klavisTypescript("vendored/gmail"),
  }),
};

export function getService(id: string): Service | undefined {
  return SERVICES[id];
}

export function listServices(): Service[] {
  return Object.values(SERVICES);
}

export function listConnectableServices(): Service[] {
  return listServices().filter(
    (s) => !s.auth.describe().instructions.startsWith("Not yet wired"),
  );
}
