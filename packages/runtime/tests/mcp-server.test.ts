import { describe, expect, it } from "bun:test";
import { runMcpServer, type RunMcpServerConfig } from "../src/mcp-server";

describe("runMcpServer", () => {
  it("exports the function", () => {
    expect(typeof runMcpServer).toBe("function");
  });

  it("accepts a RunMcpServerConfig", () => {
    const config: RunMcpServerConfig = { services: {} };
    expect(config.services).toEqual({});
  });
});
