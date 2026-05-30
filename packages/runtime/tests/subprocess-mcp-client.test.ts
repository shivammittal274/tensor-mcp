import { describe, it, expect } from "bun:test";
import {
  connectMcpClient,
  type McpClientHandle,
  type McpToolDef,
  type McpToolResult,
} from "../src/subprocess/mcp_client";

describe("connectMcpClient API surface", () => {
  it("exports the connectMcpClient function", () => {
    expect(typeof connectMcpClient).toBe("function");
  });

  it("rejects connecting to an invalid URL", async () => {
    await expect(connectMcpClient("http://127.0.0.1:1/mcp")).rejects.toThrow();
  });

  it("has the expected types", () => {
    const _check = (): void => {
      const _h: McpClientHandle = null as unknown as McpClientHandle;
      const _t: McpToolDef = { name: "x", inputSchema: {} };
      const _r: McpToolResult = { content: [{ type: "text", text: "hi" }] };
      void _h;
      void _t;
      void _r;
    };
    expect(typeof _check).toBe("function");
  });
});
