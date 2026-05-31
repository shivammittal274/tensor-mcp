# vendored/

Forked third-party MCP server implementations. We spawn these as subprocesses with our locally-stored OAuth token injected via the `AUTH_DATA` env var.

## Why fork instead of dependency

Klavis distributes their per-service MCP servers as Docker images. We need them as runnable source so:

1. Users don't need Docker on their machines
2. The compiled `tensor-mcp` binary can `Bun.spawn` directly
3. We can pin CVE-affected dependencies (e.g. `mcp>=1.23.0`)

Each vendored directory carries an `ATTRIBUTION.md` documenting the upstream source, commit SHA, license, and any modifications.

## License

Klavis MCP servers are Apache 2.0. We retain that license on each vendored directory. Any modifications we make are documented in the per-service `ATTRIBUTION.md`.

## Updating a vendored service

1. Fetch the latest upstream: `git -C /tmp/klavis-upstream pull` (or re-clone)
2. `diff -r /tmp/klavis-upstream/mcp_servers/<svc> vendored/<svc>` to see drift
3. Apply changes manually (preserving our CVE pin bumps)
4. Update `vendored/<svc>/ATTRIBUTION.md` with the new commit SHA + date

There's no automated sync — services rarely change in incompatible ways, and the manual review is the safety net.

## Currently vendored

| Service | Language | Auth tier | Notes |
|---|---|---|---|
| github | Go | PAT | Native Klavis Go server |
| gmail | TypeScript | Static OAuth | Needs `TENSOR_MCP_GMAIL_CLIENT_ID` |
| slack | Python | Static OAuth | + AUTH_DATA shim (see slack/ATTRIBUTION.md) |
| discord, dropbox, hubspot, outlook, google_calendar, google_docs, google_drive, google_sheets | Python/TS | Static OAuth | Need vendor `_CLIENT_ID` env vars |
| figma, perplexity_ai, tavily, brave_search, openrouter, firecrawl | Python/TS | API key | User pastes a long-lived key |
| clickup, trello | Python | PAT | User pastes a Personal Access Token |
| hacker_news | Python | None | Public API, no credentials |

## NOT vendored (Path A — direct hosted-MCP execution)

These vendors host their own MCP servers; tensor-mcp connects to those URLs
directly with the DCR-issued token as a Bearer header. No local subprocess.
See `packages/core/src/remote-mcp.ts` and `packages/services/index.ts`.

| Service | Hosted MCP URL |
|---|---|
| linear | https://mcp.linear.app/mcp |
| notion | https://mcp.notion.com/mcp |
| jira, confluence | https://mcp.atlassian.com/v1/sse |
| asana | https://mcp.asana.com/sse |
| cal_com | https://mcp.cal.com/mcp |
