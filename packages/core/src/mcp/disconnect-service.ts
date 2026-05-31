import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Service } from "../service";
import type { ConnectionRecord } from "../stores/connections-store";
import { connectionIdFor, type KeyValueStore, type TokenBundle } from "../stores/types";

export interface DisconnectServiceRequest {
  service: string;
}

export interface DisconnectServiceResult {
  status: "disconnected" | "not_connected";
  service: string;
  display_name: string;
}

export interface DisconnectServiceDeps {
  getService: (id: string) => Service | undefined;
  tokenStore: KeyValueStore<TokenBundle>;
  oauthClientStore: KeyValueStore<OAuthClientInformationFull>;
  connections: KeyValueStore<ConnectionRecord>;
}

/**
 * Remove a service connection. Drops the token + OAuth client info + the
 * connection metadata record. Catalog rows are intentionally kept — the
 * service's tools stay searchable (marked as `missing` connection_status)
 * so the agent can suggest reconnecting.
 *
 * Idempotent: returns `status: "not_connected"` if the service has no
 * active connection record, without raising.
 */
export async function disconnectService(
  req: DisconnectServiceRequest,
  deps: DisconnectServiceDeps,
): Promise<DisconnectServiceResult> {
  const def = deps.getService(req.service);
  if (!def) {
    throw new Error(`unknown service '${req.service}'`);
  }

  const connectionId = connectionIdFor(req.service);
  const existing = await deps.connections.get(connectionId);
  if (!existing) {
    return {
      status: "not_connected",
      service: req.service,
      display_name: def.displayName,
    };
  }

  await deps.tokenStore.delete(connectionId);
  await deps.oauthClientStore.delete(connectionId);
  await deps.connections.delete(connectionId);

  return {
    status: "disconnected",
    service: req.service,
    display_name: def.displayName,
  };
}
