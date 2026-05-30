import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { klavisExecutor } from "../src/subprocess/klavis-executor";
import { SpawnPool } from "../src/subprocess/pool";
import type { TokenBundle } from "../src/stores/types";
import type { Executor, SpawnOptions, SpawnedProcess } from "../src/subprocess/types";

const TENSOR_MCP_ROOT = join(import.meta.dir, "..", "..", "..");
const TOKEN: TokenBundle = { access_token: "test" };

const linearExec = (): Executor =>
  klavisExecutor({
    lang: "python",
    vendorDir: "vendored/linear",
  });

describe("SpawnPool", () => {
  it("spawns a service and returns the same handle on repeat ensure", async () => {
    const pool = new SpawnPool();
    const exec = linearExec();
    try {
      const h1 = await pool.ensure("linear", exec, TOKEN);
      const h2 = await pool.ensure("linear", exec, TOKEN);
      expect(h1.port).toBe(h2.port);
      expect(h1.pid).toBe(h2.pid);
      expect(h1.service).toBe("linear");
      expect(pool.running()).toContain("linear");
    } finally {
      await pool.shutdown();
    }
  }, 120_000);

  it("shutdown kills all subprocesses", async () => {
    const pool = new SpawnPool();
    const exec = linearExec();
    await pool.ensure("linear", exec, TOKEN);
    expect(pool.running()).toEqual(["linear"]);
    await pool.shutdown();
    expect(pool.running()).toEqual([]);
  }, 120_000);

  it("propagates executor errors", async () => {
    const pool = new SpawnPool();
    const failing: Executor = {
      spawn: async (_opts: SpawnOptions): Promise<SpawnedProcess> => {
        throw new Error("nope");
      },
    };
    await expect(pool.ensure("bogus", failing, TOKEN)).rejects.toThrow("nope");
    await pool.shutdown();
  });

  it("evicts slot after executor rejection so a retry re-spawns", async () => {
    const pool = new SpawnPool();
    let attempts = 0;
    const flaky: Executor = {
      spawn: async (_opts: SpawnOptions): Promise<SpawnedProcess> => {
        attempts++;
        throw new Error(`fail-${attempts}`);
      },
    };
    await expect(pool.ensure("flaky", flaky, TOKEN)).rejects.toThrow("fail-1");
    await expect(pool.ensure("flaky", flaky, TOKEN)).rejects.toThrow("fail-2");
    expect(attempts).toBe(2);
    expect(pool.running()).not.toContain("flaky");
    await pool.shutdown();
  });

  it("concurrent ensure calls share one spawn", async () => {
    const pool = new SpawnPool();
    const exec = linearExec();
    try {
      const [h1, h2, h3] = await Promise.all([
        pool.ensure("linear", exec, TOKEN),
        pool.ensure("linear", exec, TOKEN),
        pool.ensure("linear", exec, TOKEN),
      ]);
      expect(h1.pid).toBe(h2.pid);
      expect(h2.pid).toBe(h3.pid);
    } finally {
      await pool.shutdown();
    }
  }, 120_000);
});
