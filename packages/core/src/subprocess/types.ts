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
 * Each service defines how to spawn its own subprocess. Encapsulates the
 * service-specific command, env-var contract, and AUTH_DATA forging.
 *
 * Implementations:
 *   - klavisExecutor({lang:"python"|"typescript"|"go"}) — convention-based
 *   - customExecutor(opts) — for services with quirks
 */
export interface Executor {
  /**
   * Spawn a fresh subprocess and wait until its TCP port is bound.
   * Caller owns the returned handle's lifecycle.
   */
  spawn(opts: SpawnOptions): Promise<SpawnedProcess>;
}

export interface SpawnOptions {
  /** Token bundle to inject. Executor forges into AUTH_DATA per service convention. */
  token: TokenBundle;
  /** Optional: pin a port. Otherwise an ephemeral port is chosen. */
  port?: number;
  /** Optional: how long to wait for port-bind readiness. Default 60 s. */
  readinessTimeoutMs?: number;
  /** Optional: absolute path to the tensor-mcp repo root (for resolving relative vendorDir). */
  tensorMcpRoot?: string;
}
