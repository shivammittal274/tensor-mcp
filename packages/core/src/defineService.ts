import type { AuthStrategy } from "./auth/types";
import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "./services/adapt/pipedream";
import type { TokenBundle } from "./stores/types";
import type { RemoteMcpConfig } from "./transports/remote";
import type { SpawnConfig } from "./transports/types";

/**
 * A connectable third-party service. Every service is fully declared by a
 * single entry in `core/services.ts`: an auth strategy + an execution
 * descriptor (one of `spawn`, `remote`, `pipedream`).
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
   * forgeAuthData. Use convention helpers like `klavisPython` for the
   * common cases.
   */
  spawn?: SpawnConfig;

  /**
   * Hosted-MCP execution — connect a Streamable HTTP MCP client straight
   * to the vendor's URL with our stored token as a Bearer header. Use
   * `remoteMcp(url)` to build with sensible defaults.
   */
  remote?: RemoteMcpConfig;

  /**
   * In-process Pipedream component execution — no subprocess, no remote
   * MCP. The shim in `services/adapt/pipedream/` runs the upstream
   * action modules unchanged. See `services/local/slack/` for the
   * lifted-files layout this expects.
   */
  pipedream?: PipedreamServiceConfig;
}

export interface PipedreamServiceConfig {
  app: PipedreamAppModule;
  actions: PipedreamActionModule[];
  /**
   * Maps `this.$auth.<key>` reads onto fields of the stored TokenBundle.
   * Unknown keys fall through to `bundle.metadata[key]`.
   */
  authAliases?: Record<string, (bundle: TokenBundle) => unknown>;
}

/**
 * Identity helper for service files — provides type inference and a single
 * import surface in `core/services.ts`. Enforces exactly-one execution
 * descriptor at runtime.
 */
export function defineService(s: Service): Service {
  const count =
    (s.spawn != null ? 1 : 0) +
    (s.remote != null ? 1 : 0) +
    (s.pipedream != null ? 1 : 0);
  if (count !== 1) {
    throw new Error(
      `defineService('${s.id}'): exactly one of 'spawn', 'remote', or 'pipedream' must be set`,
    );
  }
  return s;
}
