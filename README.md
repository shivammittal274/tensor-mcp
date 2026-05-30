# tensor-mcp

A local-first MCP gateway. Connect your SaaS accounts once; any MCP client (Claude Desktop, Cursor, …) gets the tools — and your OAuth tokens never leave your laptop.

```
┌──────────────────┐      stdio MCP      ┌────────────────────┐
│  MCP client      │ ──────────────────▶ │ tensor-mcp serve   │
│  (Claude/Cursor) │                     │                    │
└──────────────────┘                     │  search_tools()    │
                                         │  call_tool()       │
                                         └──────────┬─────────┘
                                                    │
                            ┌───────────────────────┼───────────────────────┐
                            ▼                       ▼                       ▼
                  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
                  │   OS keychain     │  │   SQLite catalog  │  │  Klavis MCP       │
                  │   (your tokens)   │  │   (tool index)    │  │  subprocess pool  │
                  └───────────────────┘  └───────────────────┘  └───────────────────┘
```

## Why this exists

Hosted MCP aggregators (Klavis cloud, Composio, Pipedream) store your OAuth tokens **on their servers**. When the May 2026 Composio breach leaked 5,001 GitHub tokens, the architecture was the problem, not a bug.

tensor-mcp runs the same Klavis MCP servers (Apache 2.0) as local subprocesses, with tokens stored in your OS keychain via vendored Composio `cli-keyring` (ISC). The aggregator never touches your credentials.

## Quick start

```bash
# 1. Install
curl -fsSL https://tensor-mcp.dev/install | sh   # (planned)
# Or from source:
git clone https://github.com/<TBD>/tensor-mcp && cd tensor-mcp && bun install

# 2. Connect a service (opens browser, token to keychain)
tensor-mcp connect linear

# 3. Add to Claude Desktop config
cat >> ~/Library/Application\ Support/Claude/claude_desktop_config.json <<EOF
{
  "mcpServers": {
    "tensor-mcp": { "command": "/abs/path/to/tensor-mcp", "args": ["serve"] }
  }
}
EOF
```

Restart Claude Desktop. Ask Claude to use Linear. It works.

## CLI reference

```
tensor-mcp connect <service>     # OAuth → store in OS keychain → ingest tool catalog
tensor-mcp disconnect <service>  # Remove credentials
tensor-mcp show                  # List connected services
tensor-mcp search <query>        # BM25 search over the tool catalog
tensor-mcp call <svc> <tool>     # Execute one tool directly (debug aid)
tensor-mcp serve                 # MCP stdio server (Claude Desktop launches this)
```

## Supported services

| Service | Auth | Status |
|---|---|---|
| Linear | OAuth 2.1 DCR | ✅ shipped |
| Notion | OAuth 2.1 DCR | ✅ shipped |
| Jira / Confluence | OAuth 2.1 DCR | ✅ shipped |
| Slack | OAuth 2.0 (static client) | ⏳ pending app registration |
| Gmail | OAuth 2.0 (static client) | ⏳ pending Google verification |
| GitHub | PAT or static OAuth | 🔜 Phase 3 |
| Cloudflare, Sentry, Asana, Cal.com | OAuth 2.1 DCR | 🔜 Phase 3 |

DCR services need no registration on our side — the vendor auth server issues a fresh client per user.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design — package layout, what's vendored vs owned, the auth/storage/subprocess abstractions, and how a tool call flows end-to-end.

The core idea:

1. **Own only search + storage.** Everything else is a library or vendored.
2. **MCP SDK does OAuth.** We don't reimplement PKCE/DCR/refresh; `@modelcontextprotocol/sdk` ships a complete client.
3. **Klavis runs the per-service code.** We fork their `mcp_servers/*` (Apache 2.0) and spawn them as subprocesses with our local token in `AUTH_DATA`.
4. **One file per service.** Adding a service = 5 lines in `services/index.ts` + vendor the Klavis dir.

## Repo layout

```
tensor-mcp/
├── packages/
│   ├── core/      ← TS primitives: auth, stores, catalog, search, subprocess, mcp
│   ├── runtime/   ← MCP stdio server glue
│   ├── cli/       ← `tensor-mcp` binary (cac-based)
│   └── keyring/   ← vendored Composio cli-keyring (ISC)
├── services/      ← service registry — one file declares them all
└── vendored/      ← Klavis MCP servers (Apache 2.0), one folder per service
```

## Contributing

The fastest way to help: **add a service**. See [services/README.md](./services/README.md).

For bigger changes, open an issue first to discuss. Run `bun test` to see all tests green before sending a PR.

## License

This repo is licensed under [Apache 2.0](./LICENSE).

Vendored code retains its original licenses — see:
- [`vendored/<svc>/ATTRIBUTION.md`](./vendored/) for Klavis MCP servers (Apache 2.0)
- [`packages/keyring/ATTRIBUTION.md`](./packages/keyring) for Composio cli-keyring (ISC)
