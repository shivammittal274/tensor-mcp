# @tensor-mcp/cli

The user-facing `tensor-mcp` binary. Six commands, [cac](https://github.com/cacjs/cac)-based, ~350 LOC.

## Commands

```
tensor-mcp connect <service>     Authenticate with a service → store token in OS keychain → ingest tool catalog
tensor-mcp disconnect <service>  Remove a connection
tensor-mcp show                  List connected services
tensor-mcp search <query>        BM25 search the tool catalog
tensor-mcp call <svc> <tool>     Execute a tool directly (debug aid)
tensor-mcp serve                 MCP stdio server (Claude Desktop launches this)
```

Each lives in `src/commands/<name>.ts` as a single `<name>Cmd(...)` function. `src/index.ts` wires them into cac.

## How a command stays small

Commands are thin orchestration — they instantiate `core/` primitives and call `core/mcp` meta-tools. Example: `connect.ts` is ~70 LOC because it composes `getService()`, the service's `AuthStrategy.connect()`, and `ingestService()` from core. No auth logic. No spawn logic. Just glue.

If a command's body grows past ~50 lines of non-orchestration code, the missing primitive belongs in `@tensor-mcp/core`, not here.

## Single-binary build

```bash
./scripts/build.sh   # produces dist/tensor-mcp (~60MB, no Node/Bun needed at runtime)
```

The binary still needs `uv` (for Python Klavis services) on the host. Confirmed: `prompt()` and Bun's process management work in the compiled binary.
