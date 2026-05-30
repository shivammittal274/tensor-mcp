import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Catalog } from "./catalog/catalog";
import { ConnectionsIndex } from "./connections-index";
import { BM25Search, type ToolIndexable } from "./search/bm25";
import { DEFAULT_SERVICE_REGISTRY } from "./service-registry";
import { forgeAuthData } from "./subprocess/auth_data";
import { connectMcpClient } from "./subprocess/mcp_client";
import { SpawnPool, type SpawnPoolEntry } from "./subprocess/spawn-pool";
import { Vault } from "./vault";

const DEFAULT_VAULT_SERVICE = "com.tensormcp.cli";

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

export interface ToolHit {
  service: string;
  tool: string;
  score: number;
  description: string;
  input_schema: unknown;
  connection_status: "active" | "missing";
}

export interface SearchToolsResult {
  primary_tools: ToolHit[];
  missing_connections: {
    service: string;
    reason: string;
  }[];
}

export interface RunMcpServerConfig {
  vaultService?: string;
  catalogPath?: string;
  connectionsIndexPath?: string;
  tensorMcpRoot?: string;
  serviceRegistry?: Record<string, SpawnPoolEntry>;
}

const log = (msg: string): void => {
  process.stderr.write(`tensor-mcp serve: ${msg}\n`);
};

export async function handleSearch(
  args: { query: string; top_k?: number; services?: string[] },
  deps: {
    searchIndex: BM25Search<ToolIndexable>;
    catalog: Catalog;
    index: ConnectionsIndex;
  },
): Promise<SearchToolsResult> {
  const query = typeof args.query === "string" ? args.query : "";
  const topK = Math.min(Math.max(args.top_k ?? 5, 1), 20);
  const servicesFilter =
    Array.isArray(args.services) && args.services.length > 0
      ? new Set(args.services)
      : null;

  const hits = deps.searchIndex.search(query, topK * 3);
  const filtered = servicesFilter
    ? hits.filter((h) => servicesFilter.has(h.tool.service))
    : hits;
  const top = filtered.slice(0, topK);

  const primary_tools: ToolHit[] = await Promise.all(
    top.map(async (h) => {
      const full = await deps.catalog.get(h.tool.service, h.tool.toolName);
      const conn = await deps.index.get(`${h.tool.service}:default`);
      return {
        service: h.tool.service,
        tool: h.tool.toolName,
        score: h.score,
        description: full?.description ?? "",
        input_schema: full?.inputSchema ?? {},
        connection_status: conn ? "active" : "missing",
      };
    }),
  );

  const missingServices = [
    ...new Set(
      primary_tools
        .filter((t) => t.connection_status === "missing")
        .map((t) => t.service),
    ),
  ];
  const missing_connections = missingServices.map((service) => ({
    service,
    reason: `not connected. Run \`tensor-mcp connect ${service}\` first.`,
  }));

  return { primary_tools, missing_connections };
}

export async function handleCall(
  args: { service: string; tool: string; input?: Record<string, unknown> },
  deps: {
    vault: Vault;
    spawnPool: SpawnPool;
    registry: Record<string, SpawnPoolEntry>;
  },
): Promise<unknown> {
  if (!args.service || !args.tool) {
    throw new Error("call_tool requires `service` and `tool` arguments");
  }
  if (!deps.registry[args.service]) {
    throw new Error(`unknown service '${args.service}'`);
  }

  const blob = await deps.vault.get(`${args.service}:default`);
  if (!blob) {
    throw new Error(`'${args.service}' is not connected`);
  }

  const authData = forgeAuthData(args.service, blob);
  const handle = await deps.spawnPool.ensure(args.service, authData);
  const client = await connectMcpClient(handle.mcpUrl);
  try {
    return await client.callTool(args.tool, args.input ?? {});
  } finally {
    await client.close();
  }
}

function findWorkspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg)) {
      try {
        const data = require(pkg);
        if (data?.name === "tensor-mcp") return dir;
      } catch {
        /* ignore */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/**
 * Boot the MCP stdio server. Resolves once the transport is connected; the
 * SDK keeps the process alive listening on stdin until the client closes.
 *
 * All logs go to stderr — stdout is JSON-RPC and must not be polluted.
 */
export async function runMcpServer(
  config: RunMcpServerConfig = {},
): Promise<void> {
  const vaultService = config.vaultService ?? DEFAULT_VAULT_SERVICE;
  const tensorMcpRoot = config.tensorMcpRoot ?? findWorkspaceRoot();
  const registry = config.serviceRegistry ?? DEFAULT_SERVICE_REGISTRY;

  log("opening catalog...");
  const catalog = new Catalog({ path: config.catalogPath });
  await catalog.open();

  log("opening vault + connections index...");
  const vault = new Vault({ service: vaultService });
  const index = new ConnectionsIndex({ path: config.connectionsIndexPath });

  log("building search index...");
  const tools = await catalog.listAll();
  const searchIndex = new BM25Search<ToolIndexable>(
    tools.map((t) => ({
      service: t.service,
      toolName: t.toolName,
      description: t.description,
    })),
  );
  const serviceCount = new Set(tools.map((t) => t.service)).size;
  log(`indexed ${tools.length} tools across ${serviceCount} services`);

  log("creating spawn pool...");
  const spawnPool = new SpawnPool(registry, tensorMcpRoot);

  log("creating MCP server...");
  const server = new Server(
    { name: "tensor-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [SEARCH_TOOLS_DEF, CALL_TOOL_DEF],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      if (name === "search_tools") {
        const result = await handleSearch(
          (args ?? {}) as { query: string; top_k?: number; services?: string[] },
          { searchIndex, catalog, index },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
      if (name === "call_tool") {
        const result = await handleCall(
          (args ?? {}) as {
            service: string;
            tool: string;
            input?: Record<string, unknown>;
          },
          { vault, spawnPool, registry },
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
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
      await spawnPool.shutdown();
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
  await spawnPool.shutdown();
  catalog.close();
}
