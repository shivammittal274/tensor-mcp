// The five meta-tools `tensor-mcp serve` exposes — one file each, name
// parity with the CLI verbs (`apps`, `connect`, `disconnect`, `execute`,
// `search`). Algorithm primitives that `search` builds on live in
// `../search/` (BM25 / cosine / RRF / schema-summary).
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
export {
  search,
  type SearchRequest,
  type SearchResult,
  type ToolHit,
} from "./search";
