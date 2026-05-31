import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  apps,
  Catalog,
  connectApp,
  ConnectionsStore,
  connectionIdFor,
  disconnectApp,
  executeTool,
  OAuthClientStore,
  search,
  SERVICES,
  SpawnPool,
  TokenStore,
} from "@tensor-mcp/core";
import { asMcpRequest } from "../utils/args";
import { VERSION } from "../version";

// ─── Meta-tool definitions ───────────────────────────────────────────────────
// One per CLI verb. Schemas match exactly — agents calling the MCP tool
// pass the same shape they'd type on the CLI.

const SEARCH_TOOL_DEF = {
  name: "search_tools",
  description:
    "**PREFERRED STARTING POINT** for any user request that might need a third-party tool. Returns top tools ranked by BM25 + semantic embeddings (fused via RRF) with full input schemas AND pre-extracted required_params + optional_params so the next `execute` call works in one shot. Default scope = connected apps only; pass `include_unconnected: true` for discovery. Threshold-filtered (default 0.02) — empty hits means no confident match.",
  inputSchema: {
    type: "object" as const,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description:
          "What the user wants to do, in natural language. Include app hints when known ('send a Slack message' beats 'send a message').",
      },
      top_k: {
        type: "integer",
        description: "Max hits to return (default 3, max 50).",
        default: 3,
      },
      threshold: {
        type: "number",
        description:
          "Minimum score. Hits below are dropped. Default 0.02 — pass 0 to disable.",
        default: 0.02,
      },
      apps: {
        type: "array",
        items: { type: "string" },
        description: "Restrict to specific app slugs (e.g. ['linear']).",
      },
      include_unconnected: {
        type: "boolean",
        description:
          "Also surface tools from apps the user hasn't connected (rare — for discovery flows).",
        default: false,
      },
    },
  },
};

const EXECUTE_TOOL_DEF = {
  name: "execute",
  description:
    "Execute a discovered tool. Use `app` and `tool` exactly as returned by `search_tools`. If the search result indicated the app isn't connected, call `connect_app` first.",
  inputSchema: {
    type: "object" as const,
    required: ["app", "tool"],
    properties: {
      app: { type: "string", description: "App slug (e.g. 'linear')." },
      tool: {
        type: "string",
        description:
          "Tool name as returned by `search_tools` (e.g. 'linear_create_issue').",
      },
      input: {
        type: "object",
        description: "Arguments matching the tool's `input_schema`.",
      },
    },
  },
};

const LIST_APPS_DEF = {
  name: "list_apps",
  description:
    "List every registered app with connection status, auth method, and tool count. Use this when the user asks 'what can you do?' or before suggesting a `connect_app` call.",
  inputSchema: { type: "object" as const, properties: {} },
};

const CONNECT_APP_DEF = {
  name: "connect_app",
  description:
    "Connect an app so its tools become callable. Behavior depends on the app's `auth_method`:\n" +
    "• 'oauth-dcr' / 'oauth-static': opens the user's browser to complete OAuth — IGNORE the `token` arg and wait up to 5 minutes.\n" +
    "• 'pat' / 'api-key': pass the user-provided credential as `token`. Without `token`, returns `status: 'needs_token'` with the URL where the user generates one.\n" +
    "• 'no-auth': just connect; `token` ignored.\n" +
    "After success, search index refreshes — re-run `search_tools` to see the new tools.",
  inputSchema: {
    type: "object" as const,
    required: ["app"],
    properties: {
      app: { type: "string", description: "App slug (e.g. 'linear', 'github')." },
      token: {
        type: "string",
        description:
          "Personal Access Token / API key. Required only for `pat` and `api-key` auth methods.",
      },
    },
  },
};

const DISCONNECT_APP_DEF = {
  name: "disconnect_app",
  description:
    "Remove an app's stored credential + connection metadata. Catalog rows stay so the tools remain discoverable via `search_tools` (with `connected: false`) until the user reconnects.",
  inputSchema: {
    type: "object" as const,
    required: ["app"],
    properties: {
      app: { type: "string", description: "App slug (e.g. 'linear')." },
    },
  },
};

const TOOLS = [
  SEARCH_TOOL_DEF,
  EXECUTE_TOOL_DEF,
  LIST_APPS_DEF,
  CONNECT_APP_DEF,
  DISCONNECT_APP_DEF,
];

// stdout is reserved for JSON-RPC. All logs go to stderr so the host doesn't
// fail to parse a tool response.
const log = (msg: string): void => {
  process.stderr.write(`tensor-mcp serve: ${msg}\n`);
};

export interface ServeOptions {
  /** Path to the catalog database. Default: `~/.tensor-mcp/catalog.sqlite`. */
  catalogPath?: string;
  /** Override for the workspace root used by `Service.spawn.vendorDir`. */
  tensorMcpRoot?: string;
}

/**
 * Boot the MCP stdio server — what `tensor-mcp serve` runs. Lifecycle:
 *
 *  1. Open catalog + token/oauth/connections stores.
 *  2. Create a spawn pool for `spawn`-type apps.
 *  3. Register ListTools + CallTool handlers (delegate to core/mcp + core/search).
 *  4. Wire stdio transport. Resolve when transport closes.
 *  5. SIGINT/SIGTERM/stdin-EOF → shut down pool + close DB.
 */
export async function runMcpServer(options: ServeOptions = {}): Promise<void> {
  log("opening catalog...");
  const catalog = new Catalog({ path: options.catalogPath });
  await catalog.open();

  log("opening stores...");
  const tokenStore = new TokenStore();
  const oauthClientStore = new OAuthClientStore();
  const connections = new ConnectionsStore();

  log("creating spawn pool...");
  const pool = new SpawnPool();

  log("creating MCP server...");
  const server = new Server(
    { name: "tensor-mcp", version: VERSION },
    { capabilities: { tools: {} } },
  );

  const isConnected = async (app: string): Promise<boolean> =>
    (await connections.get(connectionIdFor(app))) !== null;

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req: {
    params: { name: string; arguments?: Record<string, unknown> };
  }) => {
    const { name, arguments: args } = req.params;
    try {
      if (name === "search_tools") {
        const result = await search(
          catalog,
          asMcpRequest<Parameters<typeof search>[1]>(args),
          { isConnected },
        );
        return ok(result);
      }
      if (name === "execute") {
        const result = await executeTool(
          asMcpRequest<Parameters<typeof executeTool>[0]>(args),
          {
            tokenStore,
            spawnPool: pool,
            getSpawn: (app) => SERVICES[app]?.spawn,
            getRemote: (app) => SERVICES[app]?.remote,
            tryRefresh: async (app) => {
              const def = SERVICES[app];
              if (!def) throw new Error(`unknown app '${app}'`);
              return await def.auth.connect({
                serviceId: connectionIdFor(app),
                tokenStore,
                oauthClientStore,
                io: {
                  openBrowser: async () => {
                    throw new Error(
                      `token expired and refresh failed for '${app}' — call connect_app again to re-authenticate`,
                    );
                  },
                },
              });
            },
          },
        );
        return { content: result.content, isError: result.isError };
      }
      if (name === "list_apps") {
        const result = await apps({
          listAllServices: () => Object.values(SERVICES),
          isConnected,
          catalog,
        });
        return ok(result);
      }
      if (name === "connect_app") {
        const result = await connectApp(
          asMcpRequest<Parameters<typeof connectApp>[0]>(args),
          {
            getService: (id) => SERVICES[id],
            tokenStore,
            oauthClientStore,
            connections,
            catalog,
            tensorMcpRoot: options.tensorMcpRoot,
          },
        );
        return ok(result);
      }
      if (name === "disconnect_app") {
        const result = await disconnectApp(
          asMcpRequest<Parameters<typeof disconnectApp>[0]>(args),
          {
            getService: (id) => SERVICES[id],
            tokenStore,
            oauthClientStore,
            connections,
          },
        );
        return ok(result);
      }
      throw new Error(`unknown meta-tool: ${name}`);
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: (err as Error).message }),
          },
        ],
        isError: true,
      };
    }
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("shutting down...");
    try {
      await pool.shutdown();
    } catch (err) {
      log(`spawn pool shutdown error: ${(err as Error).message}`);
    }
    try {
      catalog.close();
    } catch {
      // already closed — fine.
    }
    process.exit(0);
  };
  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });

  const transport = new StdioServerTransport();
  const closed = new Promise<void>((resolve) => {
    const prev = transport.onclose;
    transport.onclose = () => {
      prev?.();
      resolve();
    };
  });
  // Hosts close stdio servers by closing stdin. The SDK transport only
  // listens for 'data'/'error', so we wire 'end'/'close' to transport.close
  // ourselves to get a graceful exit when the parent goes away.
  process.stdin.on("end", () => {
    void transport.close();
  });
  process.stdin.on("close", () => {
    void transport.close();
  });

  log("connecting stdio transport...");
  await server.connect(transport);
  log("ready");
  await closed;
  log("transport closed; exiting");
  await pool.shutdown();
  catalog.close();
}

function ok(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}

/**
 * CLI command entry — wraps `runMcpServer` with a top-level error log so a
 * boot failure doesn't surface as an unhandled rejection.
 */
export async function serveCmd(): Promise<number> {
  try {
    await runMcpServer();
    return 0;
  } catch (err) {
    process.stderr.write(`tensor-mcp serve: ${(err as Error).message}\n`);
    return 1;
  }
}
