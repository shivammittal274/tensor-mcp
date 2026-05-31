import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { ingestService } from "../catalog/ingest";
import type { Catalog } from "../catalog/catalog";
import type { Service } from "../defineService";
import { backfillEmbeddings } from "./_backfill-embeddings";
import type { ConnectionRecord } from "../stores/connections-store";
import {
  connectionIdFor,
  type KeyValueStore,
  type TokenBundle,
} from "../stores/types";

export interface ConnectAppRequest {
  /** App slug (e.g. "linear"). */
  app: string;
  /**
   * For PAT/API-key apps: the credential to persist. Required for those
   * auth methods when invoked outside an interactive TTY. Ignored for OAuth
   * apps (DCR + static) and no-auth apps.
   */
  token?: string;
}

export interface ConnectAppResult {
  status: "connected" | "needs_token" | "not_configured";
  app: string;
  display_name: string;
  auth_method: string;
  /** When `status === "connected"`. Number of tools indexed during refresh. */
  tools_indexed?: number;
  /** When `status === "needs_token" | "not_configured"`. Next step prose. */
  instructions?: string;
}

export interface ConnectAppDeps {
  /** App registry — `(id) => Service | undefined`. */
  getService: (id: string) => Service | undefined;
  tokenStore: KeyValueStore<TokenBundle>;
  oauthClientStore: KeyValueStore<OAuthClientInformationFull>;
  connections: KeyValueStore<ConnectionRecord>;
  catalog: Catalog;
  /** Refresh the live search index after a successful ingest. */
  onCatalogChanged?: () => Promise<void> | void;
  /** Override for `Service.spawn`'s `vendorDir` resolution. */
  tensorMcpRoot?: string;
}

/**
 * Connect an app end-to-end. Per auth method:
 *
 * - `oauth-dcr` / `oauth-static`: opens the user's browser via the strategy's
 *   `redirectToAuthorization`, blocks on the loopback callback (5 min). The
 *   `token` field is ignored.
 * - `pat` / `api-key`: persists `token` directly. If absent, returns
 *   `status: "needs_token"` with the strategy's `describe()` instructions
 *   so the caller can surface "paste your token here" prose.
 * - `noAuth`: persists an anonymous bundle. `token` is ignored.
 *
 * On success: persists the connection record, ingests the catalog by
 * spawning the underlying subprocess once, computes embeddings for newly
 * indexed tools (best-effort, swallowed on failure — see [[backfillEmbeddings]]),
 * then fires `onCatalogChanged` so the long-running MCP server can rebuild
 * its search index in the same session.
 */
export async function connectApp(
  req: ConnectAppRequest,
  deps: ConnectAppDeps,
): Promise<ConnectAppResult> {
  const def = deps.getService(req.app);
  if (!def) {
    throw new Error(`unknown app '${req.app}'`);
  }

  const method = def.auth.method;
  const needsTokenInput = method === "pat" || method === "api-key";

  if (needsTokenInput && (!req.token || req.token.trim() === "")) {
    return {
      status: "needs_token",
      app: req.app,
      display_name: def.displayName,
      auth_method: method,
      instructions: def.auth.describe().instructions,
    };
  }

  const connectionId = connectionIdFor(req.app);
  let bundle: TokenBundle;
  try {
    bundle = await def.auth.connect({
      serviceId: connectionId,
      tokenStore: deps.tokenStore,
      oauthClientStore: deps.oauthClientStore,
      io: req.token
        ? { promptUser: async () => req.token as string }
        : undefined,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.toLowerCase().includes("not configured")) {
      return {
        status: "not_configured",
        app: req.app,
        display_name: def.displayName,
        auth_method: method,
        instructions: msg,
      };
    }
    throw err;
  }

  await deps.connections.set(connectionId, {
    service: req.app,
    connectionId,
    displayName: def.displayName,
    connectedAt: Date.now(),
  });

  const tools_indexed = await ingestService(deps.catalog, {
    service: req.app,
    spawn: def.spawn,
    remote: def.remote,
    token: bundle,
    tensorMcpRoot: deps.tensorMcpRoot,
  });

  // Eagerly embed the new tools so the *first* search lands on the fused
  // RRF index, not the BM25-only fallback. Failure is silent — search
  // covers the gap when called.
  await backfillEmbeddings(deps.catalog, { app: req.app });

  await deps.onCatalogChanged?.();

  return {
    status: "connected",
    app: req.app,
    display_name: def.displayName,
    auth_method: method,
    tools_indexed,
  };
}
