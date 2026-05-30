/**
 * @tensor-mcp/runtime — the MCP stdio server.
 *
 * Thin glue around `@modelcontextprotocol/sdk`'s Server class. Wires
 * `@tensor-mcp/core`'s `searchTools` and `callTool` meta-tools into the
 * JSON-RPC stdio transport that Claude Desktop launches.
 *
 * Consumed by `@tensor-mcp/cli`'s `serve` command.
 */
export { runMcpServer, type RunMcpServerConfig } from "./mcp-server";
