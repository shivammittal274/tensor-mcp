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

| Service | Language | Vendored at | License |
|---|---|---|---|
| linear | Python 3.12 | see ATTRIBUTION | Apache 2.0 |
| notion | Python 3.12 | see ATTRIBUTION | Apache 2.0 |
| jira | TypeScript (Bun) | see ATTRIBUTION | Apache 2.0 |
| slack | Python 3.12 | see ATTRIBUTION | Apache 2.0 |
| gmail | TypeScript (Bun) | see ATTRIBUTION | Apache 2.0 |
