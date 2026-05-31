import { describe, expect, it } from "bun:test";
import type { TokenBundle } from "../src/stores/types";
import { SpawnPool } from "../src/transports/stdio-pool";
import type { spawnService } from "../src/transports/stdio-spawn";
import type { SpawnConfig, SpawnedProcess } from "../src/transports/types";

const TOKEN: TokenBundle = { access_token: "test" };
const dummySpawn: SpawnConfig = {
  vendorDir: "/abs/vendored/linear",
  command: ["echo", "noop"],
};

function makeHandle(service: string, pid: number): SpawnedProcess {
  let resolveExit: (code: number) => void = () => {};
  const exited = new Promise<number>((r) => {
    resolveExit = r;
  });
  return {
    service,
    port: 4242,
    pid,
    mcpUrl: "http://127.0.0.1:4242/mcp",
    exited,
    async kill() {
      resolveExit(0);
    },
  };
}

function counterSpawn(): {
  spawnImpl: typeof spawnService;
  calls: () => number;
} {
  let n = 0;
  return {
    spawnImpl: async (service, _spawn, _opts) => makeHandle(service, ++n),
    calls: () => n,
  };
}

function alwaysThrowSpawn(error: () => Error): {
  spawnImpl: typeof spawnService;
  calls: () => number;
} {
  let n = 0;
  return {
    spawnImpl: async () => {
      n++;
      throw error();
    },
    calls: () => n,
  };
}

describe("SpawnPool", () => {
  it("returns the same handle on repeat ensure for one service", async () => {
    const { spawnImpl, calls } = counterSpawn();
    const pool = new SpawnPool({ spawnImpl });
    try {
      const h1 = await pool.ensure("linear", dummySpawn, TOKEN);
      const h2 = await pool.ensure("linear", dummySpawn, TOKEN);
      expect(h1.pid).toBe(h2.pid);
      expect(calls()).toBe(1);
      expect(pool.running()).toContain("linear");
    } finally {
      await pool.shutdown();
    }
  });

  it("shutdown kills all subprocesses and clears slots", async () => {
    const { spawnImpl } = counterSpawn();
    const pool = new SpawnPool({ spawnImpl });
    await pool.ensure("linear", dummySpawn, TOKEN);
    expect(pool.running()).toEqual(["linear"]);
    await pool.shutdown();
    expect(pool.running()).toEqual([]);
  });

  it("propagates spawn errors", async () => {
    const { spawnImpl } = alwaysThrowSpawn(() => new Error("nope"));
    const pool = new SpawnPool({ spawnImpl });
    await expect(pool.ensure("bogus", dummySpawn, TOKEN)).rejects.toThrow(
      "nope",
    );
    await pool.shutdown();
  });

  it("evicts slot after rejection so retry re-spawns", async () => {
    let attempt = 0;
    const pool = new SpawnPool({
      spawnImpl: async () => {
        attempt++;
        throw new Error(`fail-${attempt}`);
      },
    });
    await expect(pool.ensure("flaky", dummySpawn, TOKEN)).rejects.toThrow(
      "fail-1",
    );
    await expect(pool.ensure("flaky", dummySpawn, TOKEN)).rejects.toThrow(
      "fail-2",
    );
    expect(attempt).toBe(2);
    expect(pool.running()).not.toContain("flaky");
    await pool.shutdown();
  });

  it("concurrent ensure calls share one spawn", async () => {
    const { spawnImpl, calls } = counterSpawn();
    const pool = new SpawnPool({ spawnImpl });
    try {
      const [h1, h2, h3] = await Promise.all([
        pool.ensure("linear", dummySpawn, TOKEN),
        pool.ensure("linear", dummySpawn, TOKEN),
        pool.ensure("linear", dummySpawn, TOKEN),
      ]);
      expect(h1.pid).toBe(h2.pid);
      expect(h2.pid).toBe(h3.pid);
      expect(calls()).toBe(1);
    } finally {
      await pool.shutdown();
    }
  });
});
