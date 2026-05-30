import type { Catalog } from "../catalog/catalog";
import type { Service } from "../service";

export interface ServiceListing {
  id: string;
  display_name: string;
  /** "oauth-dcr" | "oauth-static" | "pat" | "api-key" */
  auth_method: string;
  /** True if this service has an active connection record. */
  connected: boolean;
  /**
   * Human-readable note shown to the agent: either the strategy's
   * `describe().instructions` (e.g. token URL for PAT, "not configured"
   * for unwired static OAuth), or "Already connected." when connected.
   */
  instructions: string;
  /** Number of tools indexed in the catalog for this service. */
  tool_count: number;
}

export interface ListServicesDeps {
  /** Iterate over the full registry. */
  listAllServices: () => Iterable<Service>;
  isConnected: (service: string) => Promise<boolean>;
  catalog: Pick<Catalog, "listByService">;
}

/**
 * Return one row per registered service, regardless of connection state,
 * so an agent can surface "Linear is not connected — run `connect linear`"
 * before it tries to call any Linear tool.
 *
 * Cheap enough to call on every request: O(services) + O(catalog rows).
 */
export async function listServices(
  deps: ListServicesDeps,
): Promise<ServiceListing[]> {
  const rows: ServiceListing[] = [];
  for (const svc of deps.listAllServices()) {
    const connected = await deps.isConnected(svc.id);
    const tools = await deps.catalog.listByService(svc.id);
    const instructions = connected
      ? "Already connected."
      : svc.auth.describe().instructions;
    rows.push({
      id: svc.id,
      display_name: svc.displayName,
      auth_method: svc.auth.method,
      connected,
      instructions,
      tool_count: tools.length,
    });
  }
  return rows;
}
