import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  BM25Search,
  callTool,
  Catalog,
  connectService,
  ConnectionsStore,
  disconnectService,
  listServices,
  OAuthClientStore,
  searchTools,
  type Service,
  SpawnPool,
  TokenStore,
} from "@tensor-mcp/core";

export interface RunMcpServerConfig {
  /** Map of service slug → Service definition. From services/ index. */
  services: Record<string, Service>;
  /** Optional: override catalog path (default ~/.tensor-mcp/catalog.sqlite). */
  catalogPath?: string;
  /** Optional: override connections-store path. */
  connectionsPath?: string;
  /** Optional: override token-store service name. */
  tokenStoreService?: string;
  /** Optional: override workspace root used to resolve `vendorDir`. */
  tensorMcpRoot?: string;
}

const SEARCH_TOOLS_DEF = {
  name: "search_tools",
  description:
    "**PREFERRED STARTING POINT** for any user request that might require a third-party tool. Returns top-K tools ranked by BM25+ relevance with full input schemas AND pre-extracted `required_params` + `optional_params` (name, type, description, enum) so you can construct a valid `call_tool` input in ONE shot — no trial-and-error required. Each hit also includes `connection_status`. Stemming-aware ('story' matches 'topstories', 'creating' matches 'create').",
  inputSchema: {
    type: "object" as const,
    required: ["query"],
    properties: {
      query: {
        type: "string",
        description:
          "What the user wants to do, in natural language. Include service hints when known (e.g. 'send a Slack message' beats 'send a message').",
      },
      top_k: {
        type: "integer",
        description: "Max number of tools to return (default 5, max 20).",
        default: 5,
      },
      services: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional service slugs to restrict the search (e.g. ['linear']).",
      },
    },
  },
};

const CALL_TOOL_DEF = {
  name: "call_tool",
  description:
    "Execute a discovered tool. Use the `service` and `tool` exactly as returned by `search_tools`. If the result indicates the service is not connected, call `connect_service` first.",
  inputSchema: {
    type: "object" as const,
    required: ["service", "tool"],
    properties: {
      service: {
        type: "string",
        description: "Service slug (e.g. 'linear')",
      },
      tool: {
        type: "string",
        description:
          "Tool name as returned by `search_tools` (e.g. 'linear_create_issue')",
      },
      input: {
        type: "object",
        description:
          "Arguments for the tool. Shape per the tool's `input_schema`.",
      },
    },
  },
};

const LIST_SERVICES_DEF = {
  name: "list_services",
  description:
    "List every registered third-party service with its connection status, auth method, and tool count. Use this when the user asks 'what can you do?' or before suggesting a `connect_service` call.",
  inputSchema: { type: "object" as const, properties: {} },
};

const CONNECT_SERVICE_DEF = {
  name: "connect_service",
  description:
    "Connect a service so its tools can be called. Behavior depends on the service's `auth_method`:\n" +
    "• 'oauth-dcr' / 'oauth-static': opens the user's default browser to complete OAuth — IGNORE the `token` arg and wait up to 5 minutes.\n" +
    "• 'pat' / 'api-key': pass the user-provided credential as `token`. If the user hasn't given one yet, call this without `token` to get back the URL where they generate it.\n" +
    "• services with no auth: just connect, `token` ignored.\n" +
    "After success, the search index refreshes — re-run `search_tools` to see the newly available tools.",
  inputSchema: {
    type: "object" as const,
    required: ["service"],
    properties: {
      service: {
        type: "string",
        description: "Service slug (e.g. 'linear', 'github')",
      },
      token: {
        type: "string",
        description:
          "Personal Access Token / API key string. Required only for `pat` and `api-key` auth methods.",
      },
    },
  },
};

const DISCONNECT_SERVICE_DEF = {
  name: "disconnect_service",
  description:
    "Remove a service's stored credential and connection metadata. Catalog rows stay so the tools are still discoverable via `search_tools` (marked 'missing' until reconnected).",
  inputSchema: {
    type: "object" as const,
    required: ["service"],
    properties: {
      service: {
        type: "string",
        description: "Service slug (e.g. 'linear')",
      },
    },
  },
};

const TOOLS = [
  SEARCH_TOOLS_DEF,
  CALL_TOOL_DEF,
  LIST_SERVICES_DEF,
  CONNECT_SERVICE_DEF,
  DISCONNECT_SERVICE_DEF,
];

const log = (msg: string): void => {
  process.stderr.write(`tensor-mcp serve: ${msg}\n`);
};

/**
 * Boot the MCP stdio server. Returns when transport closes.
 *
 * Lifecycle order:
 *   1. Open catalog → build search index from catalog.listAll()
 *   2. Open token + OAuth-client + connections stores
 *   3. Create spawn pool
 *   4. Register ListTools + CallTool handlers (delegate to core/mcp)
 *   5. Connect StdioServerTransport
 *   6. SIGINT/SIGTERM/stdin-EOF → shutdown spawn pool + close DB
 *
 * Stdout is reserved for JSON-RPC. All logs go to stderr.
 */
export async function runMcpServer(config: RunMcpServerConfig): Promise<void> {
  log("opening catalog...");
  const catalog = new Catalog({ path: config.catalogPath });
  await catalog.open();

  log("opening stores...");
  const tokenStore = new TokenStore({ service: config.tokenStoreService });
  const oauthClientStore = new OAuthClientStore({});
  const connections = new ConnectionsStore({ path: config.connectionsPath });

  log("building search index...");
  // Mutable so connect_service / disconnect_service can swap in a freshly
  // rebuilt index after catalog changes — agents in the same MCP session
  // see new tools without reconnecting Claude Desktop.
  let searchIndex = await buildIndex(catalog);
  const rebuildIndex = async () => {
    searchIndex = await buildIndex(catalog);
    log(`search index rebuilt`);
  };

  log("creating spawn pool...");
  const pool = new SpawnPool();

  log("creating MCP server...");
  const server = new Server(
    { name: "tensor-mcp", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      if (name === "search_tools") {
        const result = await searchTools(
          (args ?? {}) as {
            query: string;
            topK?: number;
            services?: string[];
          },
          {
            searchIndex,
            catalog,
            isConnected: async (service) =>
              (await connections.get(`${service}:default`)) !== null,
          },
        );
        return ok(result);
      }
      if (name === "call_tool") {
        const result = await callTool(
          (args ?? {}) as {
            service: string;
            tool: string;
            input?: Record<string, unknown>;
          },
          {
            tokenStore,
            spawnPool: pool,
            getSpawn: (s) => config.services[s]?.spawn,
            getRemote: (s) => config.services[s]?.remote,
            tryRefresh: async (s) => {
              const def = config.services[s];
              if (!def) throw new Error(`unknown service '${s}'`);
              return await def.auth.connect({
                serviceId: `${s}:default`,
                tokenStore,
                oauthClientStore,
                io: {
                  openBrowser: async () => {
                    throw new Error(
                      `token expired and refresh failed for '${s}' — call connect_service again to re-authenticate`,
                    );
                  },
                },
              });
            },
          },
        );
        return { content: result.content, isError: result.isError };
      }
      if (name === "list_services") {
        const result = await listServices({
          listAllServices: () => Object.values(config.services),
          isConnected: async (service) =>
            (await connections.get(`${service}:default`)) !== null,
          catalog,
        });
        return ok(result);
      }
      if (name === "connect_service") {
        const result = await connectService(
          (args ?? {}) as { service: string; token?: string },
          {
            getService: (id) => config.services[id],
            tokenStore,
            oauthClientStore,
            connections,
            catalog,
            onCatalogChanged: rebuildIndex,
            tensorMcpRoot: config.tensorMcpRoot,
          },
        );
        return ok(result);
      }
      if (name === "disconnect_service") {
        const result = await disconnectService(
          (args ?? {}) as { service: string },
          {
            getService: (id) => config.services[id],
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
      /* swallow */
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
  // Clients close stdio servers by closing stdin. The SDK transport only
  // listens for 'data'/'error', so we wire 'end'/'close' to transport.close()
  // ourselves to get a graceful shutdown when the parent goes away.
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

async function buildIndex(catalog: Catalog) {
  const tools = await catalog.listAll();
  const idx = new BM25Search(
    tools.map((t) => ({
      service: t.service,
      toolName: t.toolName,
      description: t.description,
    })),
  );
  const serviceCount = new Set(tools.map((t) => t.service)).size;
  log(`indexed ${tools.length} tools across ${serviceCount} services`);
  return idx;
}

function ok(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
  };
}
