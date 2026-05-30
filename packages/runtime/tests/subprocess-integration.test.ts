import { describe, it, expect } from "bun:test";
import { join } from "node:path";
import { spawnService } from "../src/subprocess/spawner";
import { connectMcpClient } from "../src/subprocess/mcp_client";
import { forgeAuthData } from "../src/subprocess/auth_data";

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");
const LINEAR_CWD = join(TENSOR_MCP_ROOT, "vendored", "linear");

describe("subprocess integration", () => {
  it("spawns Linear, connects MCP client, lists tools, kills cleanly", async () => {
    const authData = forgeAuthData("linear", {
      access_token: "smoke_test_dummy",
    });
    const handle = await spawnService({
      service: "linear",
      cwd: LINEAR_CWD,
      command: [
        "uv",
        "run",
        "--with-requirements",
        "requirements.txt",
        "python",
        "server.py",
        "--port",
        "{{PORT}}",
      ],
      authData,
      readinessTimeoutMs: 60_000,
    });

    try {
      const client = await connectMcpClient(handle.mcpUrl);
      try {
        const tools = await client.listTools();
        // Klavis Linear server exposes ~28 tools; assert >15 for robustness.
        expect(tools.length).toBeGreaterThan(15);
        const names = tools.map((t) => t.name);
        expect(names.some((n) => /issue/i.test(n))).toBe(true);
        expect(names.some((n) => /team/i.test(n))).toBe(true);
      } finally {
        await client.close();
      }
    } finally {
      await handle.kill();
    }
  }, 120_000);
});
