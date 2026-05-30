# Attribution

This directory is a fork of the Klavis MCP hacker_news server.

- **Upstream source**: https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/hacker_news
- **Upstream license**: Apache 2.0 (see Klavis repo LICENSE)
- **Vendored at commit**: 246207aec639b86b5da61bd35b017c434dc7ada3
- **Vendored date**: 2026-05-31

## Modifications from upstream

None yet.

## How tensor-mcp runs this

Spawned as a subprocess via `klavisPython("vendored/hacker_news")` (entry: `server.py`).
Tokens from tensor-mcp's keychain are forged into AUTH_DATA env per the
standard Klavis convention.
