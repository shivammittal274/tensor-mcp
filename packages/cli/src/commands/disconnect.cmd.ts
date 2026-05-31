import {
  Catalog,
  ConnectionsStore,
  disconnectApp,
  getService,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

/**
 * `tensor-mcp disconnect <app>` — removes the app from the active CLI
 * surface (clears its connection record + catalog rows). The credential
 * stays in the OS keychain — re-running `tensor-mcp connect <app>` skips
 * the auth flow and uses the stored credential.
 *
 * Idempotent: returns `status: "not_connected"` when there's no active
 * connection, never raises.
 */
export async function disconnectCmd(app: string): Promise<number> {
  if (!getService(app)) {
    return emitErr(`unknown app '${app}'`);
  }
  const connections = new ConnectionsStore();
  const catalog = new Catalog();
  await catalog.open();

  try {
    const result = await disconnectApp(
      { app },
      { getService, connections, catalog },
    );
    return emitOk(result);
  } catch (err) {
    return emitErr((err as Error).message);
  } finally {
    catalog.close();
  }
}
