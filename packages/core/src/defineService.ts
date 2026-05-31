import type { AuthStrategy } from "./auth/types";
import type { RemoteMcpConfig } from "./transports/remote";
import type { SpawnConfig } from "./transports/types";

/**
 * A connectable third-party service. Every service is fully declared by a
 * single entry in `core/services.ts`: an auth strategy + an execution
 * descriptor (either local-subprocess `spawn` or hosted-MCP `remote`).
 */
export interface Service {
  /** URL-safe slug used as the connection key (e.g. "linear", "github"). */
  id: string;

  /** Human-readable name shown in CLI/UI (e.g. "Linear", "GitHub"). */
  displayName: string;

  /** How to authenticate. Composable strategy: OAuth DCR / static / PAT / API key. */
  auth: AuthStrategy;

  /**
   * Local subprocess execution — vendorDir + command + envInject +
   * forgeAuthData. Mutually exclusive with `remote`. Use convention helpers
   * like `klavisPython` for the common cases.
   */
  spawn?: SpawnConfig;

  /**
   * Hosted-MCP execution — connect a Streamable HTTP MCP client straight
   * to the vendor's URL with our stored token as a Bearer header. No local
   * subprocess. Mutually exclusive with `spawn`. Use `remoteMcp(url)` to
   * build with sensible defaults.
   */
  remote?: RemoteMcpConfig;
}

/**
 * Identity helper for service files — provides type inference and a single
 * import surface in `core/services.ts`. Enforces exactly-one of
 * `spawn` / `remote` at runtime (TypeScript can't model "exclusive or"
 * cleanly without inflating the call site).
 */
export function defineService(s: Service): Service {
  const hasSpawn = s.spawn != null;
  const hasRemote = s.remote != null;
  if (hasSpawn === hasRemote) {
    throw new Error(
      `defineService('${s.id}'): exactly one of 'spawn' or 'remote' must be set`,
    );
  }
  return s;
}
