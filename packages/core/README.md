# @tensor-mcp/core

The owned primitives of tensor-mcp. Pure TypeScript, no MCP-server lifecycle, no CLI concerns — just the building blocks.

## Modules

| Module | Purpose |
|---|---|
| `service.ts` | `Service` interface + `defineService` helper |
| `auth/` | OAuth provider over MCP SDK + paste-token strategies + loopback callback |
| `stores/` | OS-keychain and JSON-file `KeyValueStore<T>` implementations |
| `catalog/` | SQLite-backed tool catalog + ingest from a spawned subprocess |
| `search/` | Field-weighted BM25 over a tool catalog |
| `subprocess/` | Subprocess spawn + pool + MCP client + Klavis executor convention |
| `mcp/` | `search_tools` + `call_tool` meta-tool implementations (used by both CLI and runtime MCP server) |

## Design principles

- **Type contracts in `*/types.ts`.** Interfaces live in their own file so implementations can target them without circular imports.
- **Composition over inheritance.** `TokenStore` and `OAuthClientStore` share `keychain.ts` as a factory, not a base class.
- **Inject side effects.** `AuthStrategy.connect()` takes an `AuthIO` parameter so tests can stub the browser, prompt, and callback.
- **Borrow before write.** OAuth comes from `@modelcontextprotocol/sdk`. PKCE comes from `pkce-challenge` (transitive). Catalog comes from `bun:sqlite`. BM25 comes from `okapibm25`.

## Public API

All public exports come from `src/index.ts`. Within the codebase you can also import from a sub-path:

```ts
import { mcpDcrAuth } from "@tensor-mcp/core/auth";
import { TokenStore } from "@tensor-mcp/core/stores";
import { klavisExecutor } from "@tensor-mcp/core/subprocess";
```

Consumers outside this package should use the top-level barrel.

## Tests

`bun test` runs the suite. Tests live in `tests/` mirroring the source directory structure (e.g. `tests/auth-mcp-dcr.test.ts`, `tests/stores-token-store.test.ts`).
