import type { TokenBundle } from "../stores/types";

/**
 * A live subprocess running a vendored Klavis MCP server (or equivalent).
 */
export interface SpawnedProcess {
  /** Service slug this process serves. */
  service: string;
  /** Bound TCP port (always loopback on 127.0.0.1). */
  port: number;
  /** OS process ID. */
  pid: number;
  /** Streamable HTTP MCP endpoint. */
  mcpUrl: string;
  /** Resolves when the process exits (cleanly or not). */
  exited: Promise<number>;
  /** Idempotent: SIGTERM then SIGKILL after 2 s. */
  kill(): Promise<void>;
}

/**
 * Plain data describing how to run a service's subprocess. Each Service
 * carries one of these directly — there's no Executor factory in between.
 *
 * Conventions are tiny helpers (see `klavis.ts` for `klavisPython` /
 * `klavisTypescript`) that return a SpawnConfig. Services with quirks
 * (e.g. a pre-compiled Go binary) declare the SpawnConfig literally.
 */
export interface SpawnConfig {
  /**
   * Path to the vendored service. Resolved relative to the tensor-mcp
   * workspace root unless absolute.
   */
  vendorDir: string;
  /**
   * Command line. Use `"{{PORT}}"` as a placeholder anywhere the bound
   * port should be substituted.
   */
  command: string[];
  /**
   * Extra environment variables. Values may also contain `"{{PORT}}"`.
   * `AUTH_DATA` is set automatically from `forgeAuthData`; don't put it here.
   */
  envInject?: Record<string, string>;
  /**
   * Shape the JSON passed to the subprocess in `AUTH_DATA` (base64-encoded).
   * Default: `{ access_token: bundle.access_token }`. Override for services
   * with a richer auth contract (e.g. Slack's nested `authed_user`).
   */
  forgeAuthData?: (bundle: TokenBundle) => Record<string, unknown>;
}

export interface SpawnOptions {
  /** Token bundle to inject. Forged into AUTH_DATA via `SpawnConfig.forgeAuthData`. */
  token: TokenBundle;
  /** Optional: pin a port. Otherwise an ephemeral port is chosen. */
  port?: number;
  /** Optional: how long to wait for port-bind readiness. Default 60 s. */
  readinessTimeoutMs?: number;
  /** Optional: absolute path to the tensor-mcp repo root (for resolving relative vendorDir). */
  tensorMcpRoot?: string;
}
