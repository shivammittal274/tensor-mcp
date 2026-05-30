import type { AuthStrategy } from "./auth/types";
import type { SpawnConfig } from "./subprocess/types";

/**
 * A connectable third-party service. Every service is fully declared by a
 * single entry in `packages/services/index.ts` — auth strategy + spawn config.
 */
export interface Service {
  /** URL-safe slug used as the connection key (e.g. "linear", "github"). */
  id: string;

  /** Human-readable name shown in CLI/UI (e.g. "Linear", "GitHub"). */
  displayName: string;

  /** How to authenticate. Composable strategy: OAuth DCR / static / PAT / API key. */
  auth: AuthStrategy;

  /**
   * How to run this service's subprocess. Plain data — `vendorDir + command
   * + envInject + forgeAuthData`. Use convention helpers like `klavisPython`
   * for the common cases, or write the config inline for quirks (e.g. a
   * pre-compiled Go binary with a custom command).
   */
  spawn: SpawnConfig;
}

/**
 * Identity helper for service files — provides type inference and a single
 * import surface in `packages/services/index.ts`.
 */
export function defineService(s: Service): Service {
  return s;
}
