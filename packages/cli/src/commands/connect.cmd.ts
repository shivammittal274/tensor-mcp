import {
  bootstrap,
  connectApp,
  ConnectionsStore,
  getService,
  OAuthClientStore,
  TokenStore,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

/**
 * `tensor-mcp connect <app> [token] [--extras "k=v,k2=v2"]` — pairs with
 * the MCP `connect_app` tool. For PAT/API-key apps, pass the credential
 * as `token`. For multi-field paste services (PostHog, Supabase), pass
 * the non-secret extras via `--extras`. For OAuth apps the browser opens
 * automatically.
 *
 * Always JSON. Progress messages (browser opening, ingest in progress)
 * are written to stderr — stdout stays clean for the final result so
 * agents can `tensor-mcp connect ... | jq .` safely.
 */
export async function connectCmd(
  app: string,
  token?: string,
  extrasArg?: string,
): Promise<number> {
  const def = getService(app);
  if (!def) {
    return emitErr(`unknown app '${app}'`);
  }

  let extras: Record<string, string> | undefined;
  if (extrasArg) {
    extras = {};
    for (const pair of extrasArg.split(",")) {
      const eq = pair.indexOf("=");
      if (eq < 0) {
        return emitErr(
          `invalid --extras entry '${pair.trim()}' — expected 'key=value'`,
        );
      }
      const k = pair.slice(0, eq).trim();
      const v = pair.slice(eq + 1).trim();
      if (!k) return emitErr(`invalid --extras entry '${pair.trim()}'`);
      extras[k] = v;
    }
  }

  const tokenStore = new TokenStore();
  const oauthClientStore = new OAuthClientStore();
  const connections = new ConnectionsStore();
  const catalog = await bootstrap();

  // Stderr breadcrumbs so the user sees what's happening during OAuth/ingest.
  process.stderr.write(`tensor-mcp connect: ${def.displayName}...\n`);

  try {
    const result = await connectApp(
      { app, token, extras },
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
