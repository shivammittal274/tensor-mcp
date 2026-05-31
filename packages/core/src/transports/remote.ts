import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { TokenBundle } from "../stores/types";

/**
 * The remote transport — connect a Streamable HTTP MCP client straight to a
 * vendor-hosted MCP server (Linear, Notion, Stripe, …) with our stored
 * token as a Bearer header. The vendor owns the tool code; we own the
 * dispatch. Zero per-vendor maintenance on our side once a service is
 * registered.
 *
 * Service contract:
 *   defineService({
 *     id: "linear",
 *     auth: mcpDcrAuth({ mcpServerUrl: "https://mcp.linear.app", scope: "read write" }),
 *     remote: remoteMcp("https://mcp.linear.app/mcp"),
 *   })
 */

export interface RemoteMcpConfig {
  /** Hosted MCP endpoint, e.g. `"https://mcp.linear.app/mcp"`. */
  mcpUrl: string;
  /**
   * Customize how the stored token becomes request headers. Default sends
   * `Authorization: Bearer <token.access_token>`. Override for vendors that
   * expect a different header name or shape.
   */
  authHeaders?: (token: TokenBundle) => Record<string, string>;
}

export function remoteMcp(
  mcpUrl: string,
  opts: Partial<Omit<RemoteMcpConfig, "mcpUrl">> = {},
): RemoteMcpConfig {
  return { mcpUrl, ...opts };
}

export function defaultAuthHeaders(token: TokenBundle): Record<string, string> {
  return { Authorization: `Bearer ${token.access_token}` };
}

// ─── MCP client — the wire-level adapter the remote transport uses ───────────

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export interface McpClientHandle {
  listTools(): Promise<McpToolDef[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  close(): Promise<void>;
}

/** Thrown on a 401-shaped response. Upper layers catch + tryRefresh + retry. */
export class UnauthorizedToolCallError extends Error {
  readonly name = "UnauthorizedToolCallError";
  readonly tool: string;
  readonly underlying?: unknown;

  constructor(tool: string, underlying?: unknown) {
    super(`MCP tool '${tool}' returned 401 Unauthorized`);
    this.tool = tool;
    this.underlying = underlying;
  }
}

const UNAUTHORIZED_PATTERNS = [
  /\b401\b/,
  /unauthorized/i,
  /invalid[_\s-]?token/i,
  /token[_\s-]?expired/i,
  /expired[_\s-]?token/i,
];

export function looksUnauthorized(input: unknown): boolean {
  if (input == null) return false;
  let haystack: string;
  if (typeof input === "string") {
    haystack = input;
  } else if (input instanceof Error) {
    haystack = `${input.message}`;
  } else {
    try {
      haystack = JSON.stringify(input);
    } catch {
      haystack = String(input);
    }
  }
  return UNAUTHORIZED_PATTERNS.some((re) => re.test(haystack));
}

function resultLooksUnauthorized(result: McpToolResult): boolean {
  if (!result.isError) return false;
  for (const chunk of result.content ?? []) {
    if (chunk?.text && looksUnauthorized(chunk.text)) return true;
  }
  return false;
}

/**
 * Open a Streamable HTTP MCP client. Caller owns lifecycle (call `close()`
 * after the request). `callTool` detects 401-shaped errors + result-encoded
 * 401s and throws `UnauthorizedToolCallError` so upper layers can refresh.
 */
export async function connectMcpClient(
  mcpUrl: string,
  opts: { headers?: Record<string, string> } = {},
): Promise<McpClientHandle> {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
    requestInit: opts.headers ? { headers: opts.headers } : undefined,
  });
  const client = new Client(
    { name: "tensor-mcp", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  return {
    async listTools() {
      const result = await client.listTools();
      return (result.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));
    },
    async callTool(name, args) {
      let result: Awaited<ReturnType<typeof client.callTool>>;
      try {
        result = await client.callTool({ name, arguments: args });
      } catch (err) {
        if (looksUnauthorized(err)) {
          throw new UnauthorizedToolCallError(name, err);
        }
        throw err;
      }
      const wrapped: McpToolResult = {
        content: result.content as McpToolResult["content"],
        isError: result.isError as boolean | undefined,
      };
      if (resultLooksUnauthorized(wrapped)) {
        throw new UnauthorizedToolCallError(name, wrapped);
      }
      return wrapped;
    },
    async close() {
      await client.close();
    },
  };
}
