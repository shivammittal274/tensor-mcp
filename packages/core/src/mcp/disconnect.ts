import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Service } from "../defineService";
import type { ConnectionRecord } from "../stores/connections-store";
import {
  connectionIdFor,
  type KeyValueStore,
  type TokenBundle,
} from "../stores/types";

export interface DisconnectAppRequest {
  app: string;
}

export interface DisconnectAppResult {
  status: "disconnected" | "not_connected";
  app: string;
  display_name: string;
}

export interface DisconnectAppDeps {
  getService: (id: string) => Service | undefined;
  tokenStore: KeyValueStore<TokenBundle>;
  oauthClientStore: KeyValueStore<OAuthClientInformationFull>;
  connections: KeyValueStore<ConnectionRecord>;
}

/**
 * Remove an app connection. Drops the token + OAuth client info + the
 * connection metadata. Catalog rows are intentionally kept — tools remain
 * discoverable via `search` (with `connected: false`), so the agent can
 * suggest reconnecting before recommending a different app.
 *
 * Idempotent: returns `status: "not_connected"` when there's no active
 * connection, without raising.
 */
export async function disconnectApp(
  req: DisconnectAppRequest,
  deps: DisconnectAppDeps,
): Promise<DisconnectAppResult> {
  const def = deps.getService(req.app);
  if (!def) {
    throw new Error(`unknown app '${req.app}'`);
  }

  const connectionId = connectionIdFor(req.app);
  const existing = await deps.connections.get(connectionId);
  if (!existing) {
    return {
      status: "not_connected",
      app: req.app,
      display_name: def.displayName,
    };
  }

  await deps.tokenStore.delete(connectionId);
  await deps.oauthClientStore.delete(connectionId);
  await deps.connections.delete(connectionId);

  return {
    status: "disconnected",
    app: req.app,
    display_name: def.displayName,
  };
}
