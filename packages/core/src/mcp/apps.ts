import type { Catalog } from "../catalog/catalog";
import type { Service } from "../defineService";

export interface AppRecord {
  /** URL-safe slug used by every other verb (`connect`, `execute`, …). */
  id: string;
  /** Human name shown by the CLI / surfaced to the agent. */
  display_name: string;
  /** `"oauth-dcr" | "oauth-static" | "pat" | "api-key" | "no-auth"`. */
  auth_method: string;
  /** True if there's an active connection record. */
  connected: boolean;
  /**
   * Either "Already connected." when `connected` is true, or the strategy's
   * `describe().instructions` (e.g. token URL for PAT, "not configured"
   * for an unwired static-OAuth client).
   */
  instructions: string;
  /** Number of tools indexed in the catalog for this app. */
  tool_count: number;
}

export interface AppsDeps {
  /** Iterate over the full registry. */
  listAllServices: () => Iterable<Service>;
  isConnected: (app: string) => Promise<boolean>;
  catalog: Pick<Catalog, "listByService">;
}

/**
 * Lists every registered app — connected or not — so the agent can decide
 * whether to suggest `connect_app` before calling a tool. Cheap to call:
 * O(apps × catalog rows).
 *
 * This is the `apps` meta-tool. CLI parity: `tensor-mcp apps`.
 */
export async function apps(deps: AppsDeps): Promise<AppRecord[]> {
  const rows: AppRecord[] = [];
  for (const svc of deps.listAllServices()) {
    const connected = await deps.isConnected(svc.id);
    const tools = await deps.catalog.listByService(svc.id);
    rows.push({
      id: svc.id,
      display_name: svc.displayName,
      auth_method: svc.auth.method,
      connected,
      instructions: connected
        ? "Already connected."
        : svc.auth.describe().instructions,
      tool_count: tools.length,
    });
  }
  return rows;
}
