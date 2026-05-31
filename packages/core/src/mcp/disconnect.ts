import type { Catalog } from "../catalog/catalog";
import type { Service } from "../defineService";
import type { ConnectionRecord } from "../stores/connections-store";
import { connectionIdFor, type KeyValueStore } from "../stores/types";

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
  connections: KeyValueStore<ConnectionRecord>;
  catalog: Catalog;
}

/**
 * Remove an app from the active CLI surface. Two persistent stores are
 * touched, one is left alone:
 *
 *   • `connections` (JSON file) — row removed.
 *   • `catalog`     (SQLite)    — rows for this service dropped so they
 *                                 vanish from `search` results.
 *   • `tokenStore`  (keychain)  — **kept**. The credential survives
 *                                 disconnect so a subsequent `connect <app>`
 *                                 short-circuits the auth flow and reuses
 *                                 it (no second OAuth round-trip, no
 *                                 re-paste of API keys).
 *
 * To forget the credential permanently, the user clears it via their OS
 * keychain UI (Keychain Access on macOS, Credential Manager on Windows).
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

  await deps.connections.delete(connectionId);
  await deps.catalog.dropService(req.app);

  return {
    status: "disconnected",
    app: req.app,
    display_name: def.displayName,
  };
}
