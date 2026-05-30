import { isAbsolute, join } from "node:path";
import { spawnService, type SpawnedService } from "./spawner";

export interface SpawnPoolEntry {
  vendorDir: string;
  commandTemplate: string[];
  envInject?: Record<string, string>;
}

interface PoolSlot {
  promise: Promise<SpawnedService>;
}

/**
 * Lazy, deduplicated pool of vendored MCP subprocesses.
 *
 * Concurrent `ensure` calls for the same service share a single spawn.
 * When a process exits unexpectedly, the slot is evicted so the next
 * `ensure` re-spawns rather than handing back a dead handle.
 */
export class SpawnPool {
  private readonly registry: Record<string, SpawnPoolEntry>;
  private readonly tensorMcpRoot: string;
  private readonly slots: Map<string, PoolSlot> = new Map();

  constructor(registry: Record<string, SpawnPoolEntry>, tensorMcpRoot: string) {
    this.registry = registry;
    this.tensorMcpRoot = tensorMcpRoot;
  }

  ensure(service: string, authData: string): Promise<SpawnedService> {
    const existing = this.slots.get(service);
    if (existing) return existing.promise;

    const entry = this.registry[service];
    if (!entry) {
      return Promise.reject(
        new Error(`SpawnPool: unknown service '${service}'`),
      );
    }

    const cwd = isAbsolute(entry.vendorDir)
      ? entry.vendorDir
      : join(this.tensorMcpRoot, entry.vendorDir);

    const promise = spawnService({
      service,
      cwd,
      command: entry.commandTemplate,
      envInject: entry.envInject,
      authData,
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

  running(): string[] {
    return [...this.slots.keys()];
  }
}
