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
# 1. Build from source (~1 min)
git clone https://github.com/shivammittal274/tensor-mcp.git
cd tensor-mcp
bun install
bash scripts/build.sh                  # produces dist/tensor-mcp (~56 MB)

# 2. Wire into your MCP host (Claude Desktop, Claude Code, Cursor, VSCode, Gemini)
./dist/tensor-mcp tool add claude-desktop   # auto-edits ~/Library/.../claude_desktop_config.json

# 3. Restart the host and start chatting. Inside Claude/Cursor:
#    "Connect Hacker News, then show me the top 3 stories."
#    Claude calls list_services → connect_service → search_tools → call_tool.

# 4. (Optional) Use the CLI directly
./dist/tensor-mcp connect linear           # opens browser, OAuth → token to OS keychain
./dist/tensor-mcp search "create issue"    # BM25+ stemmed search
./dist/tensor-mcp call linear linear_create_issue '{"title":"Hello","teamId":"..."}'
```

Tokens land in your OS keychain (Security.framework / libsecret) — they never leave the laptop.

## CLI reference

```
tensor-mcp connect <service>     # OAuth / PAT / API key → OS keychain → ingest tool catalog
tensor-mcp disconnect <service>  # Remove credentials (catalog rows stay)
tensor-mcp show                  # List connected services (--json for machine-readable)
tensor-mcp search <query>        # BM25+ stemmed search; --json / --schema for structured output
tensor-mcp call <svc> <tool>     # Execute one tool directly
tensor-mcp serve                 # MCP stdio server (hosts launch this)
tensor-mcp tool add <host>       # Wire tensor-mcp into a host MCP client
                                 # hosts: claude-desktop, claude-code, cursor, vscode, gemini, codex
```

### Search — what an agent gets

`search` is the primary discovery verb. Every hit comes back with the full
schema agents need to call the tool correctly on the first attempt:

```
✓ github  github_update_issue  657.369
    Update an existing issue in a GitHub repository
    Required:
      • issue_number (number) — Issue number to update
      • owner (string) — Repository owner
      • repo (string) — Repository name
    Optional:
      • assignees (array<string>) — New assignees
      • state (string=open|closed) — New state
      • title (string), body (string), labels (array<string>), milestone (number)
```

Flags:
- `--top-k <n>` — number of hits (default 8, max 20)
- `--services <a,b>` — restrict to one or more service slugs
- `--json` — emit the full structured result (every hit includes `service`,
  `tool`, `description`, `input_schema`, `required_params[]`, `optional_params[]`,
  each param with `type` / `description` / `enum`, plus `connection_status`)
- `--schema` — append the full JSON Schema under each hit (in human mode)

Example: `tensor-mcp search "update issue" --services github --top-k 1 --json`
gives an agent everything it needs to construct a valid `call_tool` input in
one shot — no trial-and-error required.

## MCP meta-tools (what agents see)

When `serve` runs, the MCP server exposes five tools to the agent:

| Tool | What it does |
|---|---|
| `search_tools` | BM25+ stemmed search over the catalog. Returns top-K tools with full input_schema + connection status. |
| `call_tool` | Execute one tool by `(service, tool, input)`. |
| `list_services` | All 26 services + auth method + connection state + tool count. |
| `connect_service` | One verb for every auth tier — OAuth opens the browser, PAT/API-key accepts a `token` arg, no-auth connects instantly. |
| `disconnect_service` | Idempotent removal. |

So the agent self-services connections from inside chat: *"Connect Slack"* → `connect_service slack` → friendly error or browser flow.

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
