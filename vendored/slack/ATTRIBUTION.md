# Attribution

This directory is a fork of the Klavis MCP Slack server.

- **Upstream source**: https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/slack
- **Upstream license**: Apache 2.0 (see Klavis repo LICENSE)
- **Vendored at commit**: 246207aec639b86b5da61bd35b017c434dc7ada3
- **Vendored date**: 2026-05-30

## Modifications from upstream

- `requirements.txt`: bumped `mcp` to `>=1.23.0` (CVE-2025-66416, DNS rebinding)
- `requirements.txt`: pinned `h11>=0.16.0` (HTTP request smuggling via malformed Chunked-Encoding)
- `server.py`: added a tensor-mcp shim near the top that reads `AUTH_DATA`
  env (the standard Klavis env-var convention) and populates
  `SLACK_BOT_TOKEN` + `SLACK_USER_TOKEN` from `{access_token, authed_user.access_token}`.
  Slack's server already reads those two env vars natively when no x-auth-data
  HTTP header is present; the shim lets tensor-mcp use a single uniform
  AUTH_DATA contract across every vendored service.

## Why this lives here

tensor-mcp spawns this Slack server as a subprocess and connects to it as
an MCP client over HTTP. Tokens come from tensor-mcp's OS-keychain vault,
forged into the `AUTH_DATA` env via the service's `forgeAuthData` callback:

```
{ access_token: <bot xoxb-...>, authed_user: { access_token: <user xoxp-...> } }
```

The shim turns that into the two env vars Slack's server reads natively.
