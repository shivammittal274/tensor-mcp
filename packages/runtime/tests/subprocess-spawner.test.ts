import { describe, it, expect } from "bun:test";
import { spawnService } from "../src/subprocess/spawner";
import { join } from "node:path";

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");
const LINEAR_CWD = join(TENSOR_MCP_ROOT, "vendored", "linear");

describe("spawnService", () => {
  it("boots the Linear server, binds its port, exposes mcpUrl, and kills cleanly", async () => {
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
      authData: Buffer.from(
        JSON.stringify({ access_token: "dummy_smoke_test" }),
      ).toString("base64"),
      readinessTimeoutMs: 60_000,
    });

    try {
      expect(handle.service).toBe("linear");
      expect(handle.port).toBeGreaterThan(1024);
      expect(handle.port).toBeLessThan(65536);
      expect(handle.pid).toBeGreaterThan(0);
      expect(handle.mcpUrl).toBe(`http://127.0.0.1:${handle.port}/mcp`);

      const conn = await Bun.connect({
        hostname: "127.0.0.1",
        port: handle.port,
        socket: {
          data() {},
          open(s) {
            s.end();
          },
        },
      });
      conn.end();
    } finally {
      await handle.kill();
    }
  }, 120_000);

  it("kill() is idempotent and resolves even after already-killed", async () => {
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
      authData: Buffer.from(
        JSON.stringify({ access_token: "dummy" }),
      ).toString("base64"),
      readinessTimeoutMs: 60_000,
    });

    await handle.kill();
    await expect(handle.kill()).resolves.toBeUndefined();
  }, 120_000);

  it("throws if command is not found", async () => {
    await expect(
      spawnService({
        service: "fake",
        cwd: "/tmp",
        command: [
          "this-command-does-not-exist-12345",
          "--port",
          "{{PORT}}",
        ],
        authData: "",
        readinessTimeoutMs: 5_000,
      }),
    ).rejects.toThrow();
  }, 30_000);
});
