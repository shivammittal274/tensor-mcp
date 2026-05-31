import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSubprocess } from "../src/transports/spawn";

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");
const VENDORED_CWD = join(TENSOR_MCP_ROOT, "vendored", "hacker_news");

describe("spawnSubprocess", () => {
  it("boots a vendored MCP server, binds its port, exposes mcpUrl, and kills cleanly", async () => {
    const handle = await spawnSubprocess({
      service: "hacker_news",
      cwd: VENDORED_CWD,
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
      expect(handle.service).toBe("hacker_news");
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
    const handle = await spawnSubprocess({
      service: "hacker_news",
      cwd: VENDORED_CWD,
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

  it("substitutes {{PORT}} in envInject values", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "spawn-env-"));
    const echoFile = join(tempDir, "env.out");

    await expect(
      spawnSubprocess({
        service: "test-echo",
        cwd: tempDir,
        command: ["sh", "-c", `echo "$MY_PORT" > ${echoFile}; sleep 60`],
        envInject: { MY_PORT: "{{PORT}}" },
        readinessTimeoutMs: 2_000,
      }),
    ).rejects.toThrow();

    const content = readFileSync(echoFile, "utf8").trim();
    expect(content).toMatch(/^\d+$/);
    expect(parseInt(content, 10)).toBeGreaterThan(1024);

    rmSync(tempDir, { recursive: true, force: true });
  }, 10_000);

  it("throws if command is not found", async () => {
    await expect(
      spawnSubprocess({
        service: "fake",
        cwd: "/tmp",
        command: [
          "this-command-does-not-exist-12345",
          "--port",
          "{{PORT}}",
        ],
        readinessTimeoutMs: 5_000,
      }),
    ).rejects.toThrow();
  }, 30_000);
});
