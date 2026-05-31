import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { ingestService } from "../catalog/ingest";
import type { Catalog } from "../catalog/catalog";
import type { Service } from "../defineService";
import { getEmbedder } from "../embeddings/embedder";
import { ensureEmbeddings } from "../embeddings/ensure";
import { buildParamText } from "../search/schema-summary";

/**
 * Bumped whenever the text fed to `embedder.embed()` changes shape.
 *
 *   v0 (implicit) — `"${toolName}: ${description}"`
 *   v1            — `"${toolName}\n${description}\n${buildParamText(...)}"`
 *
 * On connect, if the catalog's stored version is older, we drop all stored
 * embeddings so the next embed pass writes fresh vectors that match the
 * current query-side embedding text. Pre-release: nobody has embeddings
 * they care about, so a full clear is fine.
 */
export const EMBEDDING_TEXT_VERSION = 1;
const EMBEDDING_TEXT_VERSION_META_KEY = "embedding_text_version";
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
 * spawning the underlying subprocess once, eagerly computes embeddings
 * for the new tools (best-effort — falls back to BM25-only at search
 * time when embeddings aren't available), then fires `onCatalogChanged`
 * so the long-running MCP server can rebuild its search index in the
 * same session.
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

  await invalidateStaleEmbeddings(deps.catalog);
  // Backfills the just-ingested app *and* any other apps whose embeddings
  // were dropped by a version-bump invalidation, so the next semantic
  // search lands on a complete index.
  await backfillMissingEmbeddings(deps.catalog);

  await deps.onCatalogChanged?.();

  return {
    status: "connected",
    app: req.app,
    display_name: def.displayName,
    auth_method: method,
    tools_indexed,
  };
}

// If the catalog's stored embedding-text version is older than the binary's,
// the stored vectors were embedded from a different text shape and would
// score against today's queries non-deterministically. Drop them so the
// backfill pass below regenerates everything from the current text.
async function invalidateStaleEmbeddings(catalog: Catalog): Promise<void> {
  const stored = await catalog.getMeta(EMBEDDING_TEXT_VERSION_META_KEY);
  const storedVersion = stored == null ? 0 : Number(stored);
  if (Number.isFinite(storedVersion) && storedVersion >= EMBEDDING_TEXT_VERSION) {
    return;
  }
  await catalog.clearAllEmbeddings();
  await catalog.setMeta(
    EMBEDDING_TEXT_VERSION_META_KEY,
    String(EMBEDDING_TEXT_VERSION),
  );
}

// Embed every row whose embedding column is NULL — covers the just-ingested
// app *and* any other apps left empty by a version-bump invalidation. Failure
// is silent at every stage; search.ts falls back to BM25-only if anything
// here goes sideways.
async function backfillMissingEmbeddings(catalog: Catalog): Promise<void> {
  const probe = await ensureEmbeddings();
  if (!probe.available) return;

  const missing = await catalog.listNeedingEmbedding();
  if (missing.length === 0) return;

  let embedder: Awaited<ReturnType<typeof getEmbedder>>;
  try {
    embedder = await getEmbedder();
  } catch {
    return;
  }

  const texts = missing.map(
    (r) =>
      `${r.toolName}\n${r.description}\n${buildParamText(r.inputSchema ?? {})}`,
  );
  const vectors = await embedder.embed(texts);
  await catalog.updateEmbeddings(
    missing.map((r, i) => ({
      service: r.service,
      toolName: r.toolName,
      embedding: vectors[i],
    })),
  );
}

