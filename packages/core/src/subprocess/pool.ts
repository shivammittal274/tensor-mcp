import type { TokenBundle } from "../stores/types";
import { spawnService } from "./spawn-service";
import type { SpawnConfig, SpawnedProcess } from "./types";

interface PoolSlot {
  promise: Promise<SpawnedProcess>;
}

export interface SpawnPoolOptions {
  /**
   * Injectable spawn function. Defaults to the real `spawnService`. Tests
   * pass a fake to avoid touching the module graph (which leaks across
   * test files with `mock.module`).
   */
  spawnImpl?: typeof spawnService;
}

/**
 * Lazy, deduplicated pool of spawned MCP subprocesses.
 *
 * Concurrent `ensure` calls for the same service share a single spawn.
 * When a process exits, its slot is evicted so the next `ensure`
 * re-spawns rather than handing back a dead handle.
 */
export class SpawnPool {
  private readonly slots: Map<string, PoolSlot> = new Map();
  private readonly spawnImpl: typeof spawnService;

  constructor(opts: SpawnPoolOptions = {}) {
    this.spawnImpl = opts.spawnImpl ?? spawnService;
  }

  ensure(
    service: string,
    spawn: SpawnConfig,
    token: TokenBundle,
  ): Promise<SpawnedProcess> {
    const existing = this.slots.get(service);
    if (existing) return existing.promise;

    const promise = this.spawnImpl(service, spawn, {
      token,
      readinessTimeoutMs: 60_000,
    });

    const slot: PoolSlot = { promise };
    this.slots.set(service, slot);

    promise.then(
      (handle) => {
        handle.exited.finally(() => {
          if (this.slots.get(service) === slot) {
            this.slots.delete(service);
          }
        });
      },
      () => {
        if (this.slots.get(service) === slot) {
          this.slots.delete(service);
        }
      },
    );

    return promise;
  }

  running(): string[] {
    return [...this.slots.keys()];
  }

  async shutdown(): Promise<void> {
    const entries = [...this.slots.entries()];
    this.slots.clear();
    await Promise.all(
      entries.map(async ([, slot]) => {
        try {
          const handle = await slot.promise;
          await handle.kill();
        } catch {
          // Spawn failed — nothing to kill.
        }
      }),
    );
  }
}
