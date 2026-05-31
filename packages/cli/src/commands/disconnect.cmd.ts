import {
  ConnectionsStore,
  disconnectApp,
  getService,
  OAuthClientStore,
  TokenStore,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

/**
 * `tensor-mcp disconnect <app>` — pairs with the MCP `disconnect_app` tool.
 * Idempotent: returns `status: "not_connected"` when there's no active
 * connection, never raises.
 */
export async function disconnectCmd(app: string): Promise<number> {
  if (!getService(app)) {
    return emitErr(`unknown app '${app}'`);
  }
  const tokenStore = new TokenStore();
  const oauthClientStore = new OAuthClientStore();
  const connections = new ConnectionsStore();

  try {
    const result = await disconnectApp(
      { app },
      { getService, tokenStore, oauthClientStore, connections },
    );
    return emitOk(result);
  } catch (err) {
    return emitErr((err as Error).message);
  }
}
