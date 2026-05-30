import type { TokenBundle } from "../stores/types";
import type { Executor, SpawnedProcess } from "./types";

interface PoolSlot {
  promise: Promise<SpawnedProcess>;
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

  ensure(
    service: string,
    executor: Executor,
    token: TokenBundle,
  ): Promise<SpawnedProcess> {
    const existing = this.slots.get(service);
    if (existing) return existing.promise;

    const promise = executor
      .spawn({ token, readinessTimeoutMs: 60_000 })
      .then((handle) => {
        // Normalize service name in case executor returned a generic slug
        if (handle.service !== service) {
          return { ...handle, service };
        }
        return handle;
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
