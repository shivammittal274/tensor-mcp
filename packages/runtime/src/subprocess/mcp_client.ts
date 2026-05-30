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
 * Connect an MCP client to a spawned Klavis service.
 *
 * Establishes session via Streamable HTTP transport. Returns handle for
 * listTools / callTool / close. Caller owns lifecycle.
 */
export async function connectMcpClient(mcpUrl: string): Promise<McpClientHandle> {
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
      const result = await client.callTool({ name, arguments: args });
      return {
        content: result.content as McpToolResult["content"],
        isError: result.isError as boolean | undefined,
      };
    },
    async close() {
      await client.close();
    },
  };
}
