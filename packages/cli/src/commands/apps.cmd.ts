import {
  apps,
  Catalog,
  connectionIdFor,
  ConnectionsStore,
  listServices,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../json";

/**
 * `tensor-mcp apps` — every registered app with connection status, auth
 * method, and tool count. Pairs with the MCP `list_apps` tool (same shape).
 *
 * Always JSON. No flags — keep the surface minimal.
 */
export async function appsCmd(): Promise<number> {
  const catalog = new Catalog({});
  await catalog.open();
  const connections = new ConnectionsStore({});
  try {
    const records = await apps({
      listAllServices: () => listServices(),
      isConnected: async (app) =>
        (await connections.get(connectionIdFor(app))) !== null,
      catalog,
    });
    return emitOk({ apps: records });
  } catch (err) {
    return emitErr((err as Error).message);
  } finally {
    catalog.close();
  }
}
