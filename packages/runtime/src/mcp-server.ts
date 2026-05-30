import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  BM25Search,
  Catalog,
  ConnectionsStore,
  callTool,
  type Service,
  SpawnPool,
  searchTools,
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
    "Find the right tool to accomplish a task. Returns top-K ranked tools with their input schemas and connection status. Call this once per user intent; refine the query if results miss.",
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
    "Execute a discovered tool. Use the `service` and `tool` exactly as returned by search_tools.",
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
          "Tool name as returned by search_tools (e.g. 'linear_create_issue')",
      },
      input: {
        type: "object",
        description:
          "Arguments for the tool. Shape per the tool's input_schema.",
      },
    },
  },
};

const log = (msg: string): void => {
  process.stderr.write(`tensor-mcp serve: ${msg}\n`);
};

/**
 * Boot the MCP stdio server. Returns when transport closes.
 *
 * Lifecycle order:
 *   1. Open catalog → build search index from catalog.listAll()
 *   2. Open token + connections stores
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
  const connections = new ConnectionsStore({ path: config.connectionsPath });

  log("building search index...");
  const tools = await catalog.listAll();
  const searchIndex = new BM25Search(
    tools.map((t) => ({
      service: t.service,
      toolName: t.toolName,
      description: t.description,
    })),
  );
  const serviceCount = new Set(tools.map((t) => t.service)).size;
  log(`indexed ${tools.length} tools across ${serviceCount} services`);

  log("creating spawn pool...");
  const pool = new SpawnPool();

  log("creating MCP server...");
  const server = new Server(
    { name: "tensor-mcp", version: "0.2.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [SEARCH_TOOLS_DEF, CALL_TOOL_DEF],
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
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
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
          },
        );
        return {
          content: result.content,
          isError: result.isError,
        };
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
