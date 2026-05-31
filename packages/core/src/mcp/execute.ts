import type { PipedreamServiceConfig } from "../defineService";
import {
  listPipedreamTools,
  makeAuthReader,
  runPipedreamAction,
} from "../services/adapt/pipedream";
import {
  connectionIdFor,
  type KeyValueStore,
  type TokenBundle,
} from "../stores/types";
import { defaultAuthHeaders, type RemoteMcpConfig } from "../transports/remote";
import {
  connectMcpClient,
  looksUnauthorized,
  UnauthorizedToolCallError,
} from "../transports/stdio";
import type { SpawnPool } from "../transports/stdio-pool";
import type { SpawnConfig, SpawnedProcess } from "../transports/types";

export interface ExecuteToolRequest {
  /** App slug as returned by `apps` / `search`. */
  app: string;
  /** Tool name as returned by `search` (e.g. `"linear_create_issue"`). */
  tool: string;
  /** Arguments matching the tool's `input_schema`. Defaults to `{}`. */
  input?: Record<string, unknown>;
}

export interface ExecuteToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export interface ExecuteToolDeps {
  tokenStore: Pick<KeyValueStore<TokenBundle>, "get">;
  spawnPool: Pick<SpawnPool, "ensure">;
  /** Returns the app's local-subprocess descriptor, if any. */
  getSpawn: (app: string) => SpawnConfig | undefined;
  /** Returns the app's hosted-MCP descriptor, if any. */
  getRemote?: (app: string) => RemoteMcpConfig | undefined;
  /** Returns the app's Pipedream-component descriptor, if any. */
  getPipedream?: (app: string) => PipedreamServiceConfig | undefined;
  /**
   * Silently refresh an OAuth token (uses the SDK's refresh-token grant).
   * Returns the new bundle. Should throw if refresh fails — caller surfaces
   * a "re-run connect" message. Pass `undefined` to disable refresh.
   */
  tryRefresh?: (app: string) => Promise<TokenBundle>;
  /** Test override; defaults to the real Streamable-HTTP MCP client. */
  connectClient?: typeof connectMcpClient;
}

/**
 * Execute a discovered tool. Routes to whichever transport the app
 * declared in its `defineService` entry:
 *
 *  - `spawn`: pool a Klavis-style subprocess (started on demand), open a
 *    short-lived MCP client to its loopback URL, fire the call, close.
 *  - `remote`: open a short-lived MCP client straight to the vendor's
 *    hosted MCP URL with the stored token as a Bearer header
 *    (override via `RemoteMcpConfig.authHeaders`).
 *
 * On a 401 from a `remote` app, silently refresh the OAuth token via
 * `tryRefresh` and retry once. The 401 may surface during `initialize`
 * (raw transport error) OR during `tools/call` (wrapped as
 * `UnauthorizedToolCallError`); both routes are handled.
 *
 * `spawn` apps don't refresh today — their token is baked into the
 * subprocess's `AUTH_DATA` env, so refresh would require kill+respawn.
 * Tracked separately (see SpawnPool stale-token invalidation).
 */
export async function executeTool(
  req: ExecuteToolRequest,
  deps: ExecuteToolDeps,
): Promise<ExecuteToolResult> {
  if (!req.app || !req.tool) {
    throw new Error("execute requires `app` and `tool` arguments");
  }

  const pipedream = deps.getPipedream?.(req.app);
  const remote = pipedream ? undefined : deps.getRemote?.(req.app);
  const spawn = pipedream || remote ? undefined : deps.getSpawn(req.app);
  if (!pipedream && !remote && !spawn) {
    throw new Error(`unknown app '${req.app}'`);
  }

  const initialToken = await deps.tokenStore.get(connectionIdFor(req.app));
  if (!initialToken) {
    throw new Error(`'${req.app}' is not connected`);
  }

  if (pipedream) {
    return await executePipedream(req, pipedream, initialToken);
  }

  const connect = deps.connectClient ?? connectMcpClient;

  const attempt = async (token: TokenBundle): Promise<ExecuteToolResult> => {
    let mcpUrl: string;
    let headers: Record<string, string> | undefined;
    let handle: SpawnedProcess | undefined;

    if (remote) {
      mcpUrl = remote.mcpUrl;
      headers = (remote.authHeaders ?? defaultAuthHeaders)(token);
    } else if (spawn) {
      handle = await deps.spawnPool.ensure(req.app, spawn, token);
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
    const unauthorized =
      err instanceof UnauthorizedToolCallError || looksUnauthorized(err);
    if (unauthorized && remote && deps.tryRefresh) {
      const newToken = await deps.tryRefresh(req.app);
      return await attempt(newToken);
    }
    throw err;
  }
}

async function executePipedream(
  req: ExecuteToolRequest,
  cfg: PipedreamServiceConfig,
  token: TokenBundle,
): Promise<ExecuteToolResult> {
  const descriptor = listPipedreamTools(cfg.actions).find(
    (t) => t.name === req.tool,
  );
  if (!descriptor) {
    throw new Error(`unknown tool '${req.tool}' for app '${req.app}'`);
  }

  const readAuth = makeAuthReader(token, cfg.authAliases ?? {});
  const result = await runPipedreamAction({
    app: cfg.app,
    action: descriptor.action,
    input: req.input ?? {},
    readAuth,
  });

  const text = JSON.stringify(
    { summary: result.summary, result: result.return },
    null,
    2,
  );
  return { content: [{ type: "text", text }] };
}
