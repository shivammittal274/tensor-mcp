import { SERVICES } from "./services";
import type { SpawnPoolEntry } from "./subprocess/spawn-pool";

/**
 * Legacy compatibility: derive the spawn-pool registry from per-service configs.
 * New code should use `SERVICES` from `./services` directly.
 */
export const DEFAULT_SERVICE_REGISTRY: Record<string, SpawnPoolEntry> =
  Object.fromEntries(
    Object.entries(SERVICES).map(([slug, svc]) => [
      slug,
      {
        vendorDir: svc.vendor.dir,
        commandTemplate: svc.vendor.command,
        envInject: svc.vendor.envInject,
      },
    ]),
  );
