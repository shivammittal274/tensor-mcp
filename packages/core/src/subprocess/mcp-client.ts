import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

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

/**
 * Thrown when a spawned Klavis server responds with 401/Unauthorized to a
 * tool call. Upper layers catch this to trigger token refresh + retry.
 */
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

function looksUnauthorized(input: unknown): boolean {
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
 * Connect an MCP client to a spawned Klavis service.
 *
 * Establishes session via Streamable HTTP transport. Returns handle for
 * listTools / callTool / close. Caller owns lifecycle.
 *
 * The wrapped `callTool` detects 401/Unauthorized responses from the
 * spawned server and throws `UnauthorizedToolCallError` so upper layers
 * can trigger a token refresh.
 */
export async function connectMcpClient(
  mcpUrl: string,
): Promise<McpClientHandle> {
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
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
