import { describe, expect, it } from "bun:test";
import {
  connectMcpClient,
  UnauthorizedToolCallError,
  type McpClientHandle,
  type McpToolDef,
  type McpToolResult,
} from "../src/transports/stdio";

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

describe("UnauthorizedToolCallError", () => {
  it("is a named Error subclass carrying the tool name", () => {
    const err = new UnauthorizedToolCallError("linear_create_issue");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("UnauthorizedToolCallError");
    expect(err.tool).toBe("linear_create_issue");
    expect(err.message).toContain("linear_create_issue");
    expect(err.message).toMatch(/401|Unauthorized/i);
  });

  it("retains the underlying cause", () => {
    const underlying = new Error("HTTP 401 from server");
    const err = new UnauthorizedToolCallError("notion_search", underlying);
    expect(err.underlying).toBe(underlying);
  });
});
