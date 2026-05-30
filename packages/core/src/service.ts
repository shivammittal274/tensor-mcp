import type { AuthStrategy } from "./auth/types";
import type { Executor } from "./subprocess/types";

/**
 * A connectable third-party service. Adding a new service = drop a folder
 * under `services/<slug>/` with a `service.ts` that default-exports this.
 */
export interface Service {
  /** URL-safe slug used as the connection key (e.g. "linear", "github"). */
  id: string;

  /** Human-readable name shown in CLI/UI (e.g. "Linear", "GitHub"). */
  displayName: string;

  /** How to authenticate. Composable strategy: OAuth DCR / PAT / API key. */
  auth: AuthStrategy;

  /** How to spawn a subprocess for tool execution. */
  executor: Executor;

  /**
   * Optional: services may opt out of subprocess execution if they use a
   * different model (e.g. remote MCP direct). Phase 2 doesn't need this.
   */
  // executionMode?: "subprocess" | "remote";
}

/**
 * Helper for service files. Pure identity function — provides type inference
 * and a single import surface for the discoverable services list.
 */
export function defineService(s: Service): Service {
  return s;
}
