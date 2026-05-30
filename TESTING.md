# Testing tensor-mcp (for the team)

Thanks for helping shake this out. ~10 minutes start to finish.

## 1. Prereqs

- macOS or Linux (Windows untested — flag if you try)
- [`bun`](https://bun.sh) ≥ 1.3 — `curl -fsSL https://bun.sh/install | bash`
- `uv` (for Python Klavis MCP servers) — `curl -LsSf https://astral.sh/uv/install.sh | sh`
- `go` (only if you want to test the GitHub service — Klavis ships GitHub in Go)

## 2. Build

```bash
git clone <repo-url>
cd tensor-mcp
bun install
bash scripts/build.sh
```

Produces `dist/tensor-mcp` (~56 MB single binary, no runtime needed at exec).

Sanity:

```bash
./dist/tensor-mcp --help
```

You should see the 6 commands: `connect`, `disconnect`, `show`, `search`, `call`, `serve`.

## 3. Smoke the CLI (5 min)

Start with the no-auth service to verify the pipeline:

```bash
# 1. Connects instantly, ingests 9 tools
./dist/tensor-mcp connect hacker_news

# 2. Should list hacker_news as connected
./dist/tensor-mcp show

# 3. BM25+ search — should rank hackerNews_topstories at top
./dist/tensor-mcp search "top stories"

# 4. Real API call — should return JSON of live HN top stories
./dist/tensor-mcp call hacker_news hackerNews_topstories '{"count":3}'

# 5. Disconnect; tools stay in catalog (now marked ✗ in search)
./dist/tensor-mcp disconnect hacker_news
```

### Test each auth type

| Service | Auth | What to do |
|---|---|---|
| `linear` | OAuth DCR | `connect linear` — opens browser, log in, accept |
| `notion` | OAuth DCR | `connect notion` — same flow |
| `figma` | API key | Generate at https://www.figma.com/developers/api#access-tokens, `connect figma`, paste |
| `github` | PAT | Generate at https://github.com/settings/tokens/new, `connect github`, paste |
| `hacker_news` | none | `connect hacker_news` (instant) |

Then for each: `./dist/tensor-mcp search "<some query>"` and `./dist/tensor-mcp call <svc> <tool_name> '<json>'`.

Full registry: `./dist/tensor-mcp search "create"` shows all "create-something" tools across whatever you've connected.

## 4. Hook into Claude Desktop (the MCP path)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tensor-mcp": {
      "command": "/absolute/path/to/dist/tensor-mcp",
      "args": ["serve"]
    }
  }
}
```

Restart Claude Desktop completely (Quit, reopen).

In a new chat, try:

> *"Which services do you have available?"*

Claude should call `list_services` and show all 26 services with auth methods + connection status.

> *"Connect Hacker News."*

Claude should call `connect_service hacker_news` and report it's connected.

> *"Show me the top 3 HN stories."*

Claude should call `search_tools` then `call_tool` and return live data.

> *"Connect Figma. My token is figd_xxxx."*

Claude should call `connect_service figma --token figd_xxxx`.

> *"Disconnect Hacker News."*

Claude should call `disconnect_service hacker_news`.

## 5. Where tokens live

- OS keychain under service `com.tensormcp.tokens` (one entry per `<svc>:default`)
- DCR client info under `com.tensormcp.oauth-clients`
- Catalog at `~/.tensor-mcp/catalog.sqlite`
- Connection metadata at `~/.tensor-mcp/connections.json`

You can inspect / delete entries directly in `Keychain Access.app`.

## 6. What we want bug reports on

In rough priority order:

1. **OAuth flows that don't complete.** Linear / Notion / Jira / Confluence / Asana / Cal.com — all should be DCR (no client_id needed). If the browser opens but the callback hangs, capture the terminal output.
2. **Wrong stemming behavior.** `search "story"` should find `topstories`. `search "creating"` should find `linear_create_*`. If you hit a query where the right tool is obviously missing, note the query + expected hit.
3. **Tools that error after `connect`.** `connect` says "Indexed N tools", then `call` fails — likely a forgeAuthData / vendored-service mismatch.
4. **MCP-side weirdness in Claude Desktop.** Especially the 5-minute OAuth timeout window — does Claude show a spinner the whole time? Does it surface the auth URL cleanly?
5. **Build failures on your platform.** Send `uname -a` + the error.

Please file as a GitHub issue with:
- What you ran
- What you expected
- What happened (paste stderr if any)
- `bun --version` and `uname -srm`

## 7. Known limitations (not bugs)

- BM25 doesn't do typo correction. `search "stori"` won't match (Porter2 stems to `stori` from `stories`, but standalone `stori` is a token mismatch). Use real words.
- The 10 static-OAuth services (Slack, Gmail, Google Drive/Docs/Sheets/Calendar, Outlook, Discord, Dropbox, HubSpot) need a `TENSOR_MCP_<VENDOR>_CLIENT_ID` env var to work. Connect attempts without it return a friendly "not configured" message.
- GitHub via Go currently runs `go run server.go` per spawn (slow startup, ~3 s). We'll pre-compile in CI later.

## 8. Resetting state

If you want a clean slate:

```bash
rm -rf ~/.tensor-mcp/                 # catalog + connections
# In Keychain Access, search for "com.tensormcp" and delete those entries
```
