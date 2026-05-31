import { defaultAuthHeaders, type RemoteMcpConfig } from "../remote-mcp";
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
  /**
   * Returns the service's local-subprocess descriptor, if any. Mutually
   * exclusive with `getRemote`.
   */
  getSpawn: (service: string) => SpawnConfig | undefined;
  /**
   * Returns the service's hosted-MCP descriptor, if any. Mutually exclusive
   * with `getSpawn`. Either resolver should return undefined for services
   * that use the other mode.
   */
  getRemote?: (service: string) => RemoteMcpConfig | undefined;
  /** Override for tests. Defaults to the real Streamable HTTP MCP client. */
  connectClient?: typeof connectMcpClient;
}

/**
 * Execute a discovered tool. Routes to whichever execution mode the service
 * declared:
 *
 *  - `spawn`: pool a Klavis subprocess, open a short-lived MCP client to its
 *    loopback URL, fire the call, close.
 *  - `remote`: open a short-lived MCP client straight to the vendor's hosted
 *    MCP URL with the stored token attached as request headers (default:
 *    `Authorization: Bearer <token>`).
 *
 * The MCP client we open here is short-lived. Subprocess lifetime is owned
 * by the SpawnPool; remote mode has no subprocess to manage.
 */
export async function callTool(
  req: CallToolRequest,
  deps: CallToolDeps,
): Promise<CallToolResult> {
  if (!req.service || !req.tool) {
    throw new Error("call_tool requires `service` and `tool` arguments");
  }

  const remote = deps.getRemote?.(req.service);
  const spawn = remote ? undefined : deps.getSpawn(req.service);
  if (!remote && !spawn) {
    throw new Error(`unknown service '${req.service}'`);
  }

  const token = await deps.tokenStore.get(`${req.service}:default`);
  if (!token) {
    throw new Error(`'${req.service}' is not connected`);
  }

  const connect = deps.connectClient ?? connectMcpClient;

  let mcpUrl: string;
  let headers: Record<string, string> | undefined;
  let handle: SpawnedProcess | undefined;

  if (remote) {
    mcpUrl = remote.mcpUrl;
    headers = (remote.authHeaders ?? defaultAuthHeaders)(token);
  } else if (spawn) {
    handle = await deps.spawnPool.ensure(req.service, spawn, token);
    mcpUrl = handle.mcpUrl;
  } else {
    throw new Error("unreachable");
  }

  const client = await connect(mcpUrl, headers ? { headers } : undefined);
  try {
    return await client.callTool(req.tool, req.input ?? {});
  } finally {
    await client.close();
  }
}
