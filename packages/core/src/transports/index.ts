// MCP transports: stdio (local subprocess) + remote (Streamable HTTP).
//
// Every Service uses exactly one of these. `Service.spawn` → stdio. `Service.remote`
// → remote. The dispatch happens in `mcp/execute.ts` and `catalog/ingest.ts`.

// ─── stdio: local subprocess running a Klavis (or custom) MCP server ─────────
export { spawnSubprocess } from "./spawn";
export { findWorkspaceRoot, spawnService } from "./stdio-spawn";
export { SpawnPool } from "./stdio-pool";
export {
  connectMcpClient,
  looksUnauthorized,
  type McpClientHandle,
  type McpToolDef,
  type McpToolResult,
  UnauthorizedToolCallError,
} from "./stdio";
export { klavisPython, klavisTypescript } from "./klavis";
export type { SpawnConfig, SpawnedProcess, SpawnOptions } from "./types";

// ─── remote: Streamable HTTP straight to vendor-hosted MCP ───────────────────
export {
  defaultAuthHeaders,
  remoteMcp,
  type RemoteMcpConfig,
} from "./remote";
