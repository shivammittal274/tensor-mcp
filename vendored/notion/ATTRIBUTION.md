# Attribution

This directory is a fork of the Klavis MCP Notion server.

- **Upstream source**: https://github.com/Klavis-AI/klavis/tree/main/mcp_servers/notion
- **Upstream license**: Apache 2.0
- **Vendored at commit**: 246207aec639b86b5da61bd35b017c434dc7ada3
- **Vendored date**: 2026-05-31

## Modifications

- `requirements.txt`: bumped `mcp` to `>=1.23.0` (CVE-2025-66416)
- `requirements.txt`: pinned `h11>=0.16.0`

## Runtime

Python 3.12 via `uv run --with-requirements requirements.txt python server.py --port <N>`. Accepts `AUTH_DATA={"access_token":"..."}` env var. Exposes Streamable HTTP MCP at `/mcp`.
