# tensor-mcp Architecture

> **Audience**: contributors and reviewers. If you want to use tensor-mcp, see the [README](./README.md).

## Design principles

1. **Own only what differentiates us.** Search (BM25 + field weights) and storage (OS keychain) are ours. Everything else is a library or a vendored package.
2. **Library-first.** Before writing a class, check if it already exists in `@modelcontextprotocol/sdk`, `bun:sqlite`, `Bun.serve`, `Bun.spawn`, `cac`, or our vendored `@tensor-mcp/keyring`.
3. **Composable strategies.** Auth, execution, and storage are interfaces with multiple swappable implementations. New services don't fork the codebase; they pick from existing strategies.

## What we own vs borrow

| Layer | What it does | Implementation | LOC |
|---|---|---|---|
| Search | Field-weighted BM25 over the tool catalog | `okapibm25` + ~100 LOC of our weighting | 100 |
| Vault | OS keychain key-value store | vendored Composio `cli-keyring` (ISC) + ~80 LOC factory | 80 |
| OAuth | Discovery + DCR + PKCE + refresh + token exchange | `@modelcontextprotocol/sdk/client/auth` + ~100 LOC of glue | 100 |
| MCP server / client | JSON-RPC stdio + Streamable HTTP transports | `@modelcontextprotocol/sdk` | 0 |
| SQLite | Tool catalog persistence | `bun:sqlite` | 0 |
| HTTP server (OAuth callback) | Loopback receiver | `Bun.serve` | 110 |
| Subprocess spawn | Per-service execution | `Bun.spawn` + readiness probe | 150 |
| Execution code per service | Talk to Linear/Notion/Slack/etc APIs | Vendored Klavis `mcp_servers/*` (Apache 2.0) | 0 |
| CLI argument parsing | 6 commands, help, version | `cac` | 0 |
| Tests | Unit + integration | `bun:test` | 0 |

**Net**: ~1,800 LOC of our code on top of ~10,000 LOC of vendored and library code.

## Package layout

```
tensor-mcp/
├── packages/
│   ├── core/              Owned primitives + thin SDK wrappers
│   │   └── src/
│   │       ├── service.ts          Service interface + defineService
│   │       ├── auth/               Auth strategies + OAuth provider
│   │       ├── stores/             KeyValueStore<T> + keychain factory
│   │       ├── catalog/            SQLite tool catalog
│   │       ├── search/             BM25
│   │       ├── subprocess/         Spawn pool + Klavis executor
│   │       └── mcp/                search_tools + call_tool meta-tools
│   ├── runtime/           MCP stdio server (~250 LOC)
│   ├── cli/               User-facing CLI with cac (~350 LOC)
│   └── keyring/           Vendored Composio cli-keyring (ISC)
├── services/
│   └── index.ts           One file — all SERVICES declared here
└── vendored/              Klavis MCP servers (Apache 2.0), one folder per service
    ├── linear/  notion/  jira/  slack/  gmail/  …
```

## Key abstractions

### `Service`
A connectable third-party service. Carries an `id`, `displayName`, `auth` strategy, and `executor`.

```ts
interface Service {
  id: string;                 // "linear"
  displayName: string;        // "Linear"
  auth: AuthStrategy;         // mcpDcrAuth / patAuth / apiKeyAuth
  executor: Executor;         // klavisExecutor({lang: "python" | "typescript"})
}
```

### `AuthStrategy`
How a user authenticates. Strategies are factories that return objects implementing this interface:

```ts
interface AuthStrategy {
  method: "oauth-dcr" | "pat" | "api-key";
  describe(): { instructions: string };
  connect(opts: ConnectOptions): Promise<TokenBundle>;
}
```

Strategies shipping today:
- **`mcpDcrAuth`** — RFC 7591 Dynamic Client Registration + PKCE. Browser-based. No app registration on our side. Used by Linear, Notion, Atlassian, …
- **`patAuth` / `apiKeyAuth`** — User pastes a long-lived token from the vendor's UI. Same code path, different framing.

### `KeyValueStore<T>`
Typed key-value persistence:

```ts
interface KeyValueStore<T> {
  get(key: string): Promise<T | null>;
  set(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<Array<{ key: string; value: T }>>;
}
```

Three concrete stores ship today:
- **`TokenStore`** — TokenBundle blobs in OS keychain (sensitive)
- **`OAuthClientStore`** — DCR client registrations in OS keychain (sensitive)
- **`ConnectionsStore`** — Service metadata in a JSON file (non-sensitive)

Both keychain stores share `keychain.ts` factory — same `Entry` plumbing, different service namespace and type predicate.

### `Executor`
How to spawn a subprocess for tool execution:

```ts
interface Executor {
  spawn(opts: SpawnOptions): Promise<SpawnedProcess>;
}
```

Shipping today: **`klavisExecutor`** — convention-based for Python (`uv run python server.py --port {{PORT}}`) and TypeScript (`bun run index.ts` + PORT env). Forges the `x-auth-data` JSON shape Klavis expects.

## How a tool call flows end-to-end

```
User in Claude Desktop: "Create a Linear ticket called 'Test'."

1. Claude calls   search_tools(query: "create ticket")
   tensor-mcp serve runs BM25 over the SQLite catalog
   Returns:  linear_create_issue (score 0.94, connection: active)

2. Claude calls   call_tool(service: "linear", tool: "linear_create_issue", input: {...})

3. tensor-mcp serve:
   a. Looks up token via TokenStore.get("linear:default")  ──┐
   b. Checks SpawnPool for a running Linear subprocess        │ keychain
                                                              │ → Security.framework
   c. None? Launches:                                          │
        cd vendored/linear && \                                ▼
        AUTH_DATA=$(base64 '{"access_token":"lin_xxx"}') \
        uv run python server.py --port 5421

   d. Connects MCP client to http://127.0.0.1:5421/mcp
   e. Forwards the tool call
   f. Klavis Linear server (Python) hits Linear's REST API with the token
   g. Returns result up the stack

4. Token stays on disk (encrypted) and in the subprocess's env. Never touches
   any aggregator's cloud.
```

## Where the OAuth lives (the part the codebase shares with the MCP SDK)

We do not reimplement OAuth 2.1. The MCP SDK (`@modelcontextprotocol/sdk/client/auth`) ships:

- RFC 9728 protected-resource discovery
- RFC 8414 authorization server metadata discovery
- RFC 7591 Dynamic Client Registration (DCR)
- PKCE S256
- Token exchange + refresh
- Error-typed retry on revoked credentials

Our `mcpDcrAuth` strategy:
1. Spins up a loopback HTTP server (`Bun.serve`) to receive the OAuth callback
2. Builds an `OAuthClientProvider` (`packages/core/src/auth/provider.ts`) backed by our `TokenStore` + `OAuthClientStore`
3. Calls `auth(provider, { serverUrl })` — SDK handles everything
4. Returns the persisted `TokenBundle` to the caller

Glue, not OAuth.

## What we deliberately do NOT support (yet)

- **Per-platform Go binaries.** GitHub MCP requires building per-platform binaries; deferred to Phase 3 along with GitHub OAuth App registration.
- **Remote MCP transport.** Some services have hosted MCPs (`mcp.notion.com/mcp`) that we could talk to directly without spawning Klavis. We pass — keeping one execution path keeps the architecture cleaner.
- **Token refresh on 401.** The MCP SDK exposes refresh, but we don't yet hook it into `callTool`'s 401 path. Planned.
- **Multi-account per service.** Connection IDs are `<service>:default`. Multi-account would be `<service>:<label>`. Planned.
- **Tool versioning + freeze.** Pin an agent to a specific tool schema version. Unique to us; Phase 3.

## Open-source notes

- Apache 2.0 for our code
- Vendored Klavis services keep Apache 2.0 (`vendored/<svc>/ATTRIBUTION.md`)
- Vendored Composio cli-keyring keeps ISC (`packages/keyring/ATTRIBUTION.md`)
- We track upstream Klavis on the vendor-at commit recorded in each `ATTRIBUTION.md`
