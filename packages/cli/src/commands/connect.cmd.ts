import {
  Catalog,
  connectApp,
  ConnectionsStore,
  getService,
  OAuthClientStore,
  TokenStore,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

/**
 * `tensor-mcp connect <app> [token]` — pairs with the MCP `connect_app`
 * tool. For PAT/API-key apps, pass the credential as `token`. For OAuth
 * apps the browser opens automatically.
 *
 * Always JSON. Progress messages (browser opening, ingest in progress)
 * are written to stderr — stdout stays clean for the final result so
 * agents can `tensor-mcp connect ... | jq .` safely.
 */
export async function connectCmd(
  app: string,
  token?: string,
): Promise<number> {
  const def = getService(app);
  if (!def) {
    return emitErr(`unknown app '${app}'`);
  }

  const tokenStore = new TokenStore({});
  const oauthClientStore = new OAuthClientStore({});
  const connections = new ConnectionsStore({});
  const catalog = new Catalog({});
  await catalog.open();

  // Stderr breadcrumbs so the user sees what's happening during OAuth/ingest.
  process.stderr.write(`tensor-mcp connect: ${def.displayName}...\n`);

  try {
    const result = await connectApp(
      { app, token },
      {
        getService,
        tokenStore,
        oauthClientStore,
        connections,
        catalog,
      },
    );
    return emitOk(result);
  } catch (err) {
    return emitErr((err as Error).message);
  } finally {
    catalog.close();
  }
}
