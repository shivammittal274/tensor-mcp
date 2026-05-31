import { defaultAuthHeaders, type RemoteMcpConfig } from "../remote-mcp";
import type { KeyValueStore, TokenBundle } from "../stores/types";
import {
  connectMcpClient,
  looksUnauthorized,
  UnauthorizedToolCallError,
} from "../subprocess/mcp-client";
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
  /** Returns the service's local-subprocess descriptor, if any. */
  getSpawn: (service: string) => SpawnConfig | undefined;
  /** Returns the service's hosted-MCP descriptor, if any. */
  getRemote?: (service: string) => RemoteMcpConfig | undefined;
  /**
   * Silently refresh an OAuth token (uses the SDK's refresh-token grant
   * under the hood). Returns the new bundle. Throws if the refresh-token
   * is also expired — caller is responsible for surfacing "re-run
   * `tensor-mcp connect <svc>`" to the user.
   *
   * No-op signal: undefined here means "don't try to refresh on 401".
   */
  tryRefresh?: (service: string) => Promise<TokenBundle>;
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
 * On 401 (`UnauthorizedToolCallError`) for a `remote` service: silently
 * refresh the OAuth token via `tryRefresh` and retry once. Subprocess
 * services don't refresh today — their token is baked into the spawn's
 * AUTH_DATA env, so refresh would need a kill+respawn cycle (TODO).
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

  const initialToken = await deps.tokenStore.get(`${req.service}:default`);
  if (!initialToken) {
    throw new Error(`'${req.service}' is not connected`);
  }

  const connect = deps.connectClient ?? connectMcpClient;

  const attempt = async (token: TokenBundle): Promise<CallToolResult> => {
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
  };

  try {
    return await attempt(initialToken);
  } catch (err) {
    // For remote services, refresh & retry on any 401-shaped error —
    // it could fire during MCP `initialize` (raw transport error) OR
    // during `tools/call` (wrapped as UnauthorizedToolCallError). Both
    // hit the same expired-token root cause.
    const unauthorized =
      err instanceof UnauthorizedToolCallError || looksUnauthorized(err);
    if (unauthorized && remote && deps.tryRefresh) {
      const newToken = await deps.tryRefresh(req.service);
      return await attempt(newToken);
    }
    throw err;
  }
}
