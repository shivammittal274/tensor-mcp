# Attribution

This directory is a fork of the Klavis MCP Gmail server (TypeScript).

- **Upstream source**: https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/gmail
- **Upstream license**: Apache 2.0 (see Klavis repo LICENSE)
- **Vendored at commit**: 246207aec639b86b5da61bd35b017c434dc7ada3
- **Vendored date**: 2026-05-30

## Modifications from upstream

None. Source is byte-identical to upstream.

## Why this lives here

tensor-mcp spawns this Gmail server as a subprocess and connects to it as an MCP client over HTTP. Tokens come from tensor-mcp's OS-keychain vault, forged into the `x-auth-data` header the server already expects (`{access_token: <google_oauth_bearer>}`).

## Runtime

- Node >= 20 or Bun 1.x.
- **Recommended path**: `bun run src/index.ts` — runs the TypeScript source directly, no build step needed. Verified working as of 2026-05-30 (Bun 1.3.6, port bound, server logged "Server running on port <PORT>").
- Fallback if Bun isn't available: `npm install && npm run build && node build/src/index.js` (Klavis's original Docker recipe).
- Environment: `AUTH_DATA` (base64 JSON with access_token), `PORT` (default 5000; override via env).

## Dependencies

The package.json declares `googleapis ^129`, `express ^5`, `@modelcontextprotocol/sdk ^1.12`. No native modules. `bun install` resolves cleanly.
