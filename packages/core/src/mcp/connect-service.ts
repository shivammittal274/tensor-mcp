import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Service } from "../service";
import { ingestService } from "../catalog/ingest";
import type { Catalog } from "../catalog/catalog";
import type { ConnectionRecord } from "../stores/connections-store";
import { connectionIdFor, type KeyValueStore, type TokenBundle } from "../stores/types";

export interface ConnectServiceRequest {
  /** Service slug (e.g. "linear"). */
  service: string;
  /**
   * For PAT/API-key services: the credential to persist. Required for those
   * auth methods when invoked outside an interactive TTY. Ignored for OAuth
   * services (DCR + static) and no-auth services.
   */
  token?: string;
}

export interface ConnectServiceResult {
  status: "connected" | "needs_token" | "not_configured";
  service: string;
  display_name: string;
  auth_method: string;
  /** When status='connected'. Number of tools indexed during catalog refresh. */
  tools_indexed?: number;
  /** When status='needs_token' or 'not_configured'. Human-readable next step. */
  instructions?: string;
}

export interface ConnectServiceDeps {
  /** Service registry — `(id) => Service | undefined`. */
  getService: (id: string) => Service | undefined;
  tokenStore: KeyValueStore<TokenBundle>;
  oauthClientStore: KeyValueStore<OAuthClientInformationFull>;
  connections: KeyValueStore<ConnectionRecord>;
  catalog: Catalog;
  /** Called after ingest succeeds so the live search index picks up new tools. */
  onCatalogChanged?: () => Promise<void> | void;
  /** Optional override for `Service.spawn`'s `vendorDir` resolution. */
  tensorMcpRoot?: string;
}

/**
 * Connect a service end-to-end. Behavior per auth method:
 *
 * - `oauth-dcr` / `oauth-static`: opens browser via the strategy's
 *   `redirectToAuthorization`, blocks on the loopback callback (5 min
 *   default timeout). The `token` field is ignored.
 * - `pat` / `api-key`: persists `token` directly. If `token` is missing,
 *   returns `status: "needs_token"` with the strategy's `describe()`
 *   instructions — caller decides whether to prompt interactively (CLI)
 *   or surface the URL to the user (MCP).
 * - `noAuth`: persists an anonymous bundle. `token` is ignored.
 *
 * On success: persists the connection record, ingests the service's tool
 * catalog by spawning its subprocess once, and invokes `onCatalogChanged`
 * so a long-running MCP server can refresh its search index.
 */
export async function connectService(
  req: ConnectServiceRequest,
  deps: ConnectServiceDeps,
): Promise<ConnectServiceResult> {
  const def = deps.getService(req.service);
  if (!def) {
    throw new Error(`unknown service '${req.service}'`);
  }

  const method = def.auth.method;
  const needsTokenInput = method === "pat" || method === "api-key";

  if (needsTokenInput && (!req.token || req.token.trim() === "")) {
    return {
      status: "needs_token",
      service: req.service,
      display_name: def.displayName,
      auth_method: method,
      instructions: def.auth.describe().instructions,
    };
  }

  const connectionId = connectionIdFor(req.service);
  let bundle: TokenBundle;
  try {
    bundle = await def.auth.connect({
      serviceId: connectionId,
      tokenStore: deps.tokenStore,
      oauthClientStore: deps.oauthClientStore,
      io: req.token
        ? {
            promptUser: async () => req.token as string,
          }
        : undefined,
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.toLowerCase().includes("not configured")) {
      return {
        status: "not_configured",
        service: req.service,
        display_name: def.displayName,
        auth_method: method,
        instructions: msg,
      };
    }
    throw err;
  }

  await deps.connections.set(connectionId, {
    service: req.service,
    connectionId,
    displayName: def.displayName,
    connectedAt: Date.now(),
  });

  const tools_indexed = await ingestService(deps.catalog, {
    service: req.service,
    spawn: def.spawn,
    remote: def.remote,
    token: bundle,
    tensorMcpRoot: deps.tensorMcpRoot,
  });

  await deps.onCatalogChanged?.();

  return {
    status: "connected",
    service: req.service,
    display_name: def.displayName,
    auth_method: method,
    tools_indexed,
  };
}
