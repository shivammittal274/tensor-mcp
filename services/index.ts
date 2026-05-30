/**
 * tensor-mcp service registry — all supported third-party services live here.
 *
 * Adding a service:
 *   1. Vendor the Klavis MCP server under `vendored/<id>/` (see vendored/README.md)
 *   2. Add an entry to the SERVICES record below
 *   3. Run `tensor-mcp connect <id>` to OAuth + auto-ingest tools
 *
 * Auth strategies (from `@tensor-mcp/core`):
 *   - `mcpDcrAuth({mcpServerUrl, scope?})` — RFC 7591 Dynamic Client Registration
 *     against a vendor-hosted MCP server. Browser-based OAuth, no app
 *     registration needed. Works for: Linear, Notion, Atlassian, Asana,
 *     Cloudflare, Sentry, Cal.com.
 *   - `patAuth({tokenUrl, description})` — user pastes a Personal Access
 *     Token. Use for vendors without DCR (GitHub).
 *   - `apiKeyAuth({signupUrl, description})` — same UX as PAT, framed as
 *     "API key" for vendors that issue long-lived keys (Cal.com via direct API).
 *
 * Executors:
 *   - `klavisExecutor({vendorDir, lang})` — convention-based subprocess spawn.
 *     `lang: "python"` runs `uv run python server.py --port {{PORT}}`.
 *     `lang: "typescript"` runs `bun run index.ts` with PORT env.
 */

import {
  type AuthStrategy,
  type Service,
  defineService,
  klavisExecutor,
  mcpDcrAuth,
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
    executor: klavisExecutor({ vendorDir: "vendored/linear", lang: "python" }),
  }),

  notion: defineService({
    id: "notion",
    displayName: "Notion",
    auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.notion.com" }),
    executor: klavisExecutor({ vendorDir: "vendored/notion", lang: "python" }),
  }),

  jira: defineService({
    id: "jira",
    displayName: "Jira (Atlassian)",
    auth: mcpDcrAuth({
      mcpServerUrl: "https://mcp.atlassian.com",
      scope: "read:jira-work write:jira-work read:jira-user",
    }),
    executor: klavisExecutor({
      vendorDir: "vendored/jira",
      lang: "typescript",
    }),
  }),

  slack: defineService({
    id: "slack",
    displayName: "Slack",
    auth: oauthPending("Slack OAuth App registration"),
    executor: klavisExecutor({ vendorDir: "vendored/slack", lang: "python" }),
  }),

  gmail: defineService({
    id: "gmail",
    displayName: "Gmail",
    auth: oauthPending("Google Cloud project + OAuth verification"),
    executor: klavisExecutor({
      vendorDir: "vendored/gmail",
      lang: "typescript",
    }),
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
