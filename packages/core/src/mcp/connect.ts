import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthIO } from "../auth/types";
import { ingestService } from "../catalog/ingest";
import type { Catalog } from "../catalog/catalog";
import type { Service } from "../defineService";
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
  /**
   * Optional override for the auth strategy's IO — used by the MCP serve
   * path to capture the OAuth redirect URL instead of spawning a browser
   * from inside the host's subprocess. CLI leaves this unset; the strategy
   * falls back to `defaultOpenBrowser`.
   */
  io?: AuthIO;
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
 * On success: persists the connection record + ingests the catalog. We
 * deliberately do NOT compute embeddings here — the first `search` after
 * connect lazily downloads the model (if needed) and embeds whatever's
 * missing, so users who only run BM25-style searches never pay for
 * embeddings they don't use.
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
      io: mergeIO(deps.io, req.token),
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
    pipedream: def.pipedream,
    token: bundle,
    tensorMcpRoot: deps.tensorMcpRoot,
  });

  await deps.onCatalogChanged?.();

  return {
    status: "connected",
    app: req.app,
    display_name: def.displayName,
    auth_method: method,
    tools_indexed,
  };
}

// Compose an AuthIO from the optional caller override plus the pasted-token
// shortcut. The caller's `openBrowser` wins (lets the MCP path intercept the
// URL), `promptUser` defaults to returning the pasted token when one was
// supplied — keeps the PAT/API-key flow working without a TTY.
function mergeIO(
  override: AuthIO | undefined,
  pastedToken: string | undefined,
): AuthIO | undefined {
  if (!override && !pastedToken) return undefined;
  return {
    openBrowser: override?.openBrowser,
    awaitCallback: override?.awaitCallback,
    promptUser:
      override?.promptUser ??
      (pastedToken ? async () => pastedToken : undefined),
  };
}
