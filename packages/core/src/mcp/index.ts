// Meta-tool implementations — these are what `tensor-mcp serve` exposes as
// MCP tools, and what the CLI verbs call into. Public name parity with the
// CLI: `apps`, `connect`, `disconnect`, `execute`. Search lives next to its
// algorithm code in `../search/`.
export {
  apps,
  type AppRecord,
  type AppsDeps,
} from "./apps";
export {
  connectApp,
  type ConnectAppDeps,
  type ConnectAppRequest,
  type ConnectAppResult,
} from "./connect";
export {
  disconnectApp,
  type DisconnectAppDeps,
  type DisconnectAppRequest,
  type DisconnectAppResult,
} from "./disconnect";
export {
  executeTool,
  type ExecuteToolDeps,
  type ExecuteToolRequest,
  type ExecuteToolResult,
} from "./execute";
