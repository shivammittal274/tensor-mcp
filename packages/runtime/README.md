# @tensor-mcp/runtime

The MCP stdio server. Thin glue around `@modelcontextprotocol/sdk`'s `Server` + `StdioServerTransport` that wires `@tensor-mcp/core`'s `searchTools` + `callTool` meta-tools to the JSON-RPC protocol.

Consumed by `@tensor-mcp/cli`'s `serve` command — which is what Claude Desktop launches via `claude_desktop_config.json`.

## What's in here

Just one source file: `src/mcp-server.ts` (~230 LOC).

- Opens the catalog + token store + connections store + spawn pool
- Builds a BM25 index from `catalog.listAll()`
- Registers `ListTools` + `CallTool` JSON-RPC handlers (delegate to `core/mcp`)
- Handles SIGINT / SIGTERM / stdin-EOF shutdown
- Logs to **stderr only** — stdout is JSON-RPC

## Critical correctness note

Stdio MCP servers MUST keep stdout free of anything that isn't a valid JSON-RPC frame. Any `console.log` from a dependency will corrupt the protocol. We:

1. Use `process.stderr.write` for all our logs
2. Hold the process alive on `transport.onclose` (the SDK's `connect()` resolves immediately; without this the process exits at ~60ms)
3. Bridge `process.stdin.on('end' | 'close')` to `transport.close()` for graceful shutdown
