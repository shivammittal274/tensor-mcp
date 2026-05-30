import type { KeyValueStore, TokenBundle } from "../stores/types";
import { connectMcpClient } from "../subprocess/mcp-client";
import type { SpawnPool } from "../subprocess/pool";
import type { SpawnConfig, SpawnedProcess } from "../subprocess/types";

export interface CallToolRequest {
  service: string;
  tool: string;
  input?: Record<string, unknown>;
}

export interface CallToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export interface CallToolDeps {
  tokenStore: Pick<KeyValueStore<TokenBundle>, "get">;
  spawnPool: Pick<SpawnPool, "ensure">;
  getSpawn: (service: string) => SpawnConfig | undefined;
  /** Override for tests. Defaults to the real Streamable HTTP MCP client. */
  connectClient?: typeof connectMcpClient;
}

/**
 * Execute a discovered tool inside a pooled, spawned MCP subprocess.
 *
 * Lookups are abstracted behind callbacks: `getSpawn` decouples this from
 * any specific service-registry, `tokenStore` from any specific keychain
 * impl, and `connectClient` is overridable so tests don't need a live
 * Streamable HTTP transport.
 *
 * The MCP client we open here is short-lived — the SpawnPool owns the
 * subprocess. We close the client in `finally` but never kill the process.
 */
export async function callTool(
  req: CallToolRequest,
  deps: CallToolDeps,
): Promise<CallToolResult> {
  if (!req.service || !req.tool) {
    throw new Error("call_tool requires `service` and `tool` arguments");
  }

  const spawn = deps.getSpawn(req.service);
  if (!spawn) {
    throw new Error(`unknown service '${req.service}'`);
  }

  const token = await deps.tokenStore.get(req.service);
  if (!token) {
    throw new Error(`'${req.service}' is not connected`);
  }

  const handle: SpawnedProcess = await deps.spawnPool.ensure(
    req.service,
    spawn,
    token,
  );

  const connect = deps.connectClient ?? connectMcpClient;
  const client = await connect(handle.mcpUrl);
  try {
    return await client.callTool(req.tool, req.input ?? {});
  } finally {
    await client.close();
  }
}
