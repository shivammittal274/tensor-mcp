# Attribution

This directory is a fork of the Klavis MCP Jira server (TypeScript).

- **Upstream source**: https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/jira
- **Upstream license**: Apache 2.0
- **Vendored at commit**: 246207aec639b86b5da61bd35b017c434dc7ada3
- **Vendored date**: 2026-05-31

## Modifications

None — source byte-identical to upstream.

## Runtime

Verified path: `bun run index.ts` (TypeScript source runs directly under Bun, no build step). PORT via env var, default 5000. AUTH_DATA shape: `{"access_token":"<atlassian_oauth_token>", "selected_cloud_id":"<optional>"}`. Without `selected_cloud_id`, Klavis falls back to the first accessible Atlassian resource.

Fallback path if Bun unavailable: `npm install && npm run build && node build/index.js`.
