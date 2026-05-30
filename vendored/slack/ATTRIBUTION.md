# Attribution

This directory is a fork of the Klavis MCP Slack server.

- **Upstream source**: https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/slack
- **Upstream license**: Apache 2.0 (see Klavis repo LICENSE)
- **Vendored at commit**: 246207aec639b86b5da61bd35b017c434dc7ada3
- **Vendored date**: 2026-05-30

## Modifications from upstream

- `requirements.txt`: bumped `mcp` to `>=1.23.0` (CVE-2025-66416, DNS rebinding)
- `requirements.txt`: pinned `h11>=0.16.0` (HTTP request smuggling via malformed Chunked-Encoding)

No other changes. The execution code, tools, and OAuth-passthrough pattern remain verbatim.

## Why this lives here

tensor-mcp spawns this Slack server as a subprocess and connects to it as an MCP client over HTTP. Tokens come from tensor-mcp's OS-keychain vault, forged into the `x-auth-data` header the server already expects.

The Slack server reads a richer auth shape: `{access_token: <bot xoxb-...>, authed_user: {access_token: <user xoxp-...>}}`. tensor-mcp's `forgeAuthData("slack", blob)` currently uses the simplified Phase 1 shape (`{access_token}` only); Phase 2 may extend to the bot+user split when adding multi-account.
