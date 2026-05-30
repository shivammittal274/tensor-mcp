import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { forgeAuthData } from "../src/subprocess/auth_data";
import { SpawnPool, type SpawnPoolEntry } from "../src/subprocess/spawn-pool";

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");
const REGISTRY: Record<string, SpawnPoolEntry> = {
  linear: {
    vendorDir: "vendored/linear",
    commandTemplate: [
      "uv",
      "run",
      "--with-requirements",
      "requirements.txt",
      "python",
      "server.py",
      "--port",
      "{{PORT}}",
    ],
  },
};

describe("SpawnPool", () => {
  it("spawns a service and returns the same handle on repeat ensure", async () => {
    const pool = new SpawnPool(REGISTRY, TENSOR_MCP_ROOT);
    const auth = forgeAuthData("linear", { access_token: "test" });
    try {
      const h1 = await pool.ensure("linear", auth);
      const h2 = await pool.ensure("linear", auth);
      expect(h1.port).toBe(h2.port);
      expect(h1.pid).toBe(h2.pid);
      expect(pool.running()).toContain("linear");
    } finally {
      await pool.shutdown();
    }
  }, 120_000);

  it("shutdown kills all subprocesses", async () => {
    const pool = new SpawnPool(REGISTRY, TENSOR_MCP_ROOT);
    const auth = forgeAuthData("linear", { access_token: "test" });
    await pool.ensure("linear", auth);
    expect(pool.running()).toEqual(["linear"]);
    await pool.shutdown();
    expect(pool.running()).toEqual([]);
  }, 120_000);

  it("throws on unknown service", async () => {
    const pool = new SpawnPool(REGISTRY, TENSOR_MCP_ROOT);
    await expect(pool.ensure("nope", "data")).rejects.toThrow();
    await pool.shutdown();
  });

  it("concurrent ensure calls share one spawn", async () => {
    const pool = new SpawnPool(REGISTRY, TENSOR_MCP_ROOT);
    const auth = forgeAuthData("linear", { access_token: "test" });
    try {
      const [h1, h2, h3] = await Promise.all([
        pool.ensure("linear", auth),
        pool.ensure("linear", auth),
        pool.ensure("linear", auth),
      ]);
      expect(h1.pid).toBe(h2.pid);
      expect(h2.pid).toBe(h3.pid);
    } finally {
      await pool.shutdown();
    }
  }, 120_000);
});
