import type { PipedreamServiceConfig } from "../defineService";
import {
  connectionIdFor,
  type KeyValueStore,
  type TokenBundle,
} from "../stores/types";
import {
  connectMcpClient,
  defaultAuthHeaders,
  looksUnauthorized,
  type McpToolResult,
  type RemoteMcpConfig,
  UnauthorizedToolCallError,
} from "../transports/remote";
import {
  listPipedreamTools,
  makeAuthReader,
  runPipedreamAction,
} from "../transports/pipedream";

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
 * Execute a discovered tool. Two transport branches, one each:
 *
 *  - `remote`: open a short-lived MCP client to the vendor's hosted MCP URL
 *    with the stored token as a Bearer header (override via
 *    `RemoteMcpConfig.authHeaders`). The vendor runs the tool code and
 *    returns the result.
 *
 *  - `pipedream`: run the upstream Pipedream component code in-process.
 *    `services/<app>/` holds the lifted `.mjs` files; the runtime in
 *    `transports/pipedream/` instantiates the action's `this` context (with
 *    a `$auth` proxy backed by our keychain) and invokes its `run()`.
 *
 * On any 401-shaped failure, attempt one silent token refresh + retry.
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
  if (!pipedream && !remote) {
    throw new Error(`unknown app '${req.app}'`);
  }

  const initialToken = await deps.tokenStore.get(connectionIdFor(req.app));
  if (!initialToken) {
    throw new Error(`'${req.app}' is not connected`);
  }

  if (pipedream) {
    return await runOnce(
      () => executePipedream(req, pipedream, initialToken),
      deps.tryRefresh ? () => deps.tryRefresh!(req.app) : undefined,
      (token) => executePipedream(req, pipedream, token),
    );
  }
  if (remote) {
    return await runOnce(
      () => executeRemote(req, remote, initialToken, deps.connectClient),
      deps.tryRefresh ? () => deps.tryRefresh!(req.app) : undefined,
      (token) => executeRemote(req, remote, token, deps.connectClient),
    );
  }
  throw new Error("unreachable");
}

// Generic 401-then-refresh-then-retry-once wrapper, shared by both transport
// branches so refresh semantics stay identical no matter who's running the
// tool code.
async function runOnce(
  attempt: () => Promise<ExecuteToolResult>,
  refresh: undefined | (() => Promise<TokenBundle>),
  retryWith: (token: TokenBundle) => Promise<ExecuteToolResult>,
): Promise<ExecuteToolResult> {
  try {
    return await attempt();
  } catch (err) {
    const unauthorized =
      err instanceof UnauthorizedToolCallError || looksUnauthorized(err);
    if (unauthorized && refresh) {
      const newToken = await refresh();
      return await retryWith(newToken);
    }
    throw err;
  }
}

async function executeRemote(
  req: ExecuteToolRequest,
  cfg: RemoteMcpConfig,
  token: TokenBundle,
  connectClient?: typeof connectMcpClient,
): Promise<ExecuteToolResult> {
  const connect = connectClient ?? connectMcpClient;
  const headers = (cfg.authHeaders ?? defaultAuthHeaders)(token);
  const client = await connect(cfg.mcpUrl, { headers });
  try {
    const r: McpToolResult = await client.callTool(req.tool, req.input ?? {});
    return { content: r.content, isError: r.isError };
  } finally {
    await client.close();
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
