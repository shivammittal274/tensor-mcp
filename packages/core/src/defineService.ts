import type { AuthStrategy } from "./auth/types";
import type { TokenBundle } from "./stores/types";
import type {
  PipedreamActionModule,
  PipedreamAppModule,
} from "./transports/pipedream";
import type { RemoteMcpConfig } from "./transports/remote";

/**
 * A connectable third-party service. Every entry under `services/` is one
 * `defineService({...})` call. A service picks **exactly one** transport:
 *
 *   • `remote`    — hosted MCP at a vendor URL. Connects via
 *                   Streamable HTTP, attaches our stored token as a Bearer
 *                   header. The vendor runs the tool code. Pattern of
 *                   choice for vendors that ship a public MCP endpoint
 *                   (Linear, Notion, Stripe, Sentry, …).
 *
 *   • `pipedream` — in-process runner over lifted Pipedream component
 *                   code. tensor-mcp's binary executes the upstream
 *                   `<app>.app.mjs` + `actions/` modules unchanged; auth
 *                   tokens stay in the OS keychain and every API call
 *                   goes from the user's machine direct to the vendor.
 */
export interface Service {
  /** URL-safe slug used as the connection key (e.g. "linear", "slack"). */
  id: string;

  /** Human-readable name shown in CLI/UI. */
  displayName: string;

  /** How to authenticate. Composable strategy: OAuth DCR / static / PAT / API key / no-auth. */
  auth: AuthStrategy;

  /** Hosted-MCP execution. Use `remoteMcp(url)` to build with sensible defaults. */
  remote?: RemoteMcpConfig;

  /** In-process Pipedream component execution. See `services/slack/` for the layout. */
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
 * import surface in `services/<name>.ts`. Enforces exactly-one transport at
 * runtime so a misconfigured service fails fast at registry boot, not at
 * the first call.
 */
export function defineService(s: Service): Service {
  const count = (s.remote != null ? 1 : 0) + (s.pipedream != null ? 1 : 0);
  if (count !== 1) {
    throw new Error(
      `defineService('${s.id}'): exactly one of 'remote' or 'pipedream' must be set`,
    );
  }
  return s;
}
