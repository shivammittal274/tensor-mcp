import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  AuthNotConfiguredError,
  AuthRefreshFailedError,
} from "../auth/errors";
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

/**
 * How close to `expires_at` we consider a bundle "stale" during reconnect.
 * Smaller than the runtime refresh window in `mcp/execute.ts` — reconnect
 * is one-shot, not part of a workflow, so a tight 60s buffer is enough.
 */
const RECONNECT_REFRESH_WINDOW_MS = 60_000;

export interface ConnectAppRequest {
  /** App slug (e.g. "linear"). */
  app: string;
  /**
   * For PAT/API-key apps: the credential to persist. When supplied,
   * always overwrites any existing keychain entry. Ignored for OAuth
   * apps (DCR + static) and no-auth apps.
   */
  token?: string;
  /**
   * For multi-field paste services (PostHog instance_url, Supabase
   * subdomain): the non-secret extra fields, keyed by the strategy's
   * `FieldSpec.key`. Single-field PAT services ignore this.
   */
  extras?: Record<string, string>;
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
  /**
   * When `status === "needs_token"` and the strategy needs non-secret
   * extras alongside the primary token (PostHog instance_url, Supabase
   * subdomain). The agent / CLI prompts the user for each, then retries
   * with `{token, extras: {...}}`. Absent for single-field PAT services.
   */
  required_fields?: ReadonlyArray<{
    key: string;
    label: string;
    description?: string;
    default?: string;
    is_secret: boolean;
  }>;
  /**
   * When `status === "connected"`, set to `true` when the credential was
   * loaded from the OS keychain rather than freshly acquired. UX hint:
   * the CLI/MCP path skipped the OAuth flow / paste-token prompt.
   */
  reused_credential?: boolean;
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
  /**
   * Optional override for the auth strategy's IO — used by the MCP serve
   * path to capture the OAuth redirect URL instead of spawning a browser
   * from inside the host's subprocess. CLI leaves this unset; the strategy
   * falls back to `defaultOpenBrowser`.
   */
  io?: AuthIO;
}

/**
 * Connect an app end-to-end. Three entry points:
 *
 *   • Reconnect (no `token` arg, credential already in keychain) — skips
 *     the auth flow entirely, re-adds the catalog rows, marks the
 *     connection live. Common after a `disconnect` (which intentionally
 *     keeps the keychain entry around for fast reconnection).
 *
 *   • Fresh OAuth (`oauth-dcr` / `oauth` methods) — opens the user's
 *     browser via the strategy's `openBrowser` IO callback, blocks on the
 *     loopback callback (5 min). Persists the resulting bundle.
 *
 *   • Fresh paste (`pat` / `api-key` methods) — when `token` is supplied,
 *     stores it directly; when absent, returns `needs_token` with the
 *     strategy's `describe()` prose so the caller can show the
 *     vendor-specific prompt.
 *
 * On success: writes the connection record + ingests the catalog so the
 * tools become discoverable via `search`. Embeddings are computed lazily
 * on the first `search` call to keep `connect` fast.
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
  const connectionId = connectionIdFor(req.app);

  // ── Reconnect path: credential already in keychain, no new token supplied ──
  // The user disconnected previously (or just rebooted) and wants the app
  // active again. Skip the auth flow if we can; just re-attach + re-ingest
  // the catalog. For OAuth bundles past expiry, transparently refresh first
  // so the first `execute` call doesn't take the 401-then-refresh hit.
  if (!req.token) {
    const bundle = await tryReuseExisting(deps, def, connectionId);
    if (bundle) {
      const tools_indexed = await persistConnectionAndIngest(
        deps,
        def,
        connectionId,
        bundle,
      );
      return {
        status: "connected",
        app: req.app,
        display_name: def.displayName,
        auth_method: method,
        tools_indexed,
        reused_credential: true,
      };
    }
  }

  // ── Fresh paste: paste-style strategies need a `token` to proceed ──
  const needsTokenInput = method === "pat" || method === "api-key";
  if (needsTokenInput && (!req.token || req.token.trim() === "")) {
    const description = def.auth.describe();
    return {
      status: "needs_token",
      app: req.app,
      display_name: def.displayName,
      auth_method: method,
      instructions: description.instructions,
      required_fields: description.fields?.map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        default: f.default,
        is_secret: f.isSecret ?? false,
      })),
    };
  }

  // ── Fresh OAuth (or paste with token): pre-flight isConfigured ──
  const status = def.auth.isConfigured();
  if (!status.ok) {
    return {
      status: "not_configured",
      app: req.app,
      display_name: def.displayName,
      auth_method: method,
      instructions: status.reason,
    };
  }

  let bundle: TokenBundle;
  try {
    bundle = await def.auth.connect({
      serviceId: connectionId,
      tokenStore: deps.tokenStore,
      oauthClientStore: deps.oauthClientStore,
      io: mergeIO(deps.io, req.token),
      prefilled: req.token
        ? { access_token: req.token, metadata: req.extras }
        : undefined,
    });
  } catch (err) {
    if (err instanceof AuthNotConfiguredError) {
      return {
        status: "not_configured",
        app: req.app,
        display_name: def.displayName,
        auth_method: method,
        instructions: err.hint,
      };
    }
    throw err;
  }

  const tools_indexed = await persistConnectionAndIngest(
    deps,
    def,
    connectionId,
    bundle,
  );

  return {
    status: "connected",
    app: req.app,
    display_name: def.displayName,
    auth_method: method,
    tools_indexed,
  };
}

/**
 * Decide whether the stored bundle can be reused without running the auth
 * flow. Four cases:
 *
 *   1. No stored bundle                       → null (fall through to auth)
 *   2. Bundle has no `expires_at`             → reuse as-is (paste tokens,
 *                                                long-lived OAuth like
 *                                                Slack xoxb-)
 *   3. Bundle still valid (> 60s remaining)   → reuse as-is
 *   4. Bundle stale → try `strategy.refresh()`:
 *        a. Refresh succeeds                  → reuse the new bundle
 *        b. `AuthRefreshFailedError`          → null (fall through to a
 *                                                fresh auth flow)
 *        c. Other error                       → rethrow
 */
async function tryReuseExisting(
  deps: ConnectAppDeps,
  def: Service,
  connectionId: string,
): Promise<TokenBundle | null> {
  const existing = await deps.tokenStore.get(connectionId);
  if (!existing) return null;
  if (!existing.expires_at) return existing;
  if (existing.expires_at > Date.now() + RECONNECT_REFRESH_WINDOW_MS) {
    return existing;
  }
  try {
    return await def.auth.refresh(existing, {
      serviceId: connectionId,
      tokenStore: deps.tokenStore,
      oauthClientStore: deps.oauthClientStore,
    });
  } catch (err) {
    if (err instanceof AuthRefreshFailedError) return null;
    throw err;
  }
}

/**
 * Shared tail of both the reconnect and the fresh-connect paths: record
 * the connection, ingest the service's tools into the catalog, fire the
 * optional `onCatalogChanged` callback. Pure side effects, no branching.
 */
async function persistConnectionAndIngest(
  deps: ConnectAppDeps,
  def: Service,
  connectionId: string,
  bundle: TokenBundle,
): Promise<number> {
  await deps.connections.set(connectionId, {
    service: def.id,
    connectionId,
    displayName: def.displayName,
    connectedAt: Date.now(),
  });

  const tools_indexed = await ingestService(deps.catalog, {
    service: def.id,
    remote: def.remote,
    pipedream: def.pipedream,
    token: bundle,
  });

  await deps.onCatalogChanged?.();
  return tools_indexed;
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
