import type { Catalog } from "../catalog/catalog";
import { ensureEmbeddings } from "../embeddings/ensure";
import { getEmbedder } from "../embeddings/embedder";
import { BM25Search, type ToolIndexable } from "../search/bm25";
import { reciprocalRankFusion } from "../search/rrf";
import {
  buildEmbeddingText,
  buildParamText,
  EMBEDDING_TEXT_VERSION,
  EMBEDDING_TEXT_VERSION_META_KEY,
  type ParamSummary,
  summarizeSchema,
} from "../search/schema-summary";
import { SemanticSearch } from "../search/semantic";

// Tunables — every CLI/MCP knob that affects the search pipeline lives here.
// Public surface (the SearchRequest below) exposes the same defaults so the
// agent gets the same behavior whether it calls via the CLI or the MCP tool.
const DEFAULT_TOP_K = 3;
const MAX_TOP_K = 50;
const DEFAULT_THRESHOLD = 0.01;
// Over-fetch each ranker so RRF has enough candidates to fuse meaningfully.
// 4× over top_k is the standard Cormack et al. recommendation.
const OVERFETCH = 4;

export interface SearchRequest {
  /** Natural-language query. Required. */
  query: string;
  /** Max hits to return. Default 3. Capped at 50. */
  top_k?: number;
  /**
   * Lower bound on score (RRF when fused, BM25 otherwise). Hits below the
   * threshold are dropped. Default 0.01. Pass 0 to disable filtering.
   */
  threshold?: number;
  /**
   * Restrict to specific app slugs. Always intersected with the set of
   * currently-connected apps (the catalog only holds connected services'
   * tools — disconnect drops them).
   */
  apps?: string[];
}

export interface ToolHit {
  app: string;
  tool: string;
  score: number;
  description: string;
  input_schema: unknown;
  required_params: ParamSummary[];
  optional_params: ParamSummary[];
  /**
   * Present only when both BM25 and semantic rankers contributed. Maps
   * ranker name → 0-indexed rank in that ranker. Useful for debugging why
   * a hit landed where it did.
   */
  ranker_contributions?: Record<string, number>;
}

export interface SearchResult {
  hits: ToolHit[];
  /**
   * `true` when the result was fused from BM25 + semantic. `false` when
   * we ran BM25 only — happens when embeddings aren't installed on the
   * user's box (e.g. Windows, or first run before download).
   */
  semantic_used: boolean;
}

/**
 * The one search entry point. Always uses BM25; layers semantic + RRF on top
 * when embeddings are available. Falls back transparently to BM25-only if
 * the embedder can't initialize (unsupported platform, download failure).
 *
 * Catalog scope: only currently-connected services have catalog rows —
 * disconnect drops them, connect re-adds. So every hit is by definition
 * for a callable tool, and there's no `include_unconnected` toggle.
 *
 * Pipeline:
 *   1. Load the full catalog (BM25 index is built per-call — cheap at our
 *      scale, < 5 ms for ~1k tools).
 *   2. Apply optional `apps` filter.
 *   3. Try `ensureEmbeddings()` to see if semantic is available this turn.
 *   4. BM25 over the in-scope tools.
 *   5. If semantic: embed query + run cosine, then RRF-fuse the two lists.
 *   6. Apply threshold + slice to top_k.
 *   7. Hydrate hits with description, schema, param summaries.
 *
 * Never throws on embedder failure — search ALWAYS returns something usable.
 */
export async function search(
  catalog: Catalog,
  req: SearchRequest,
): Promise<SearchResult> {
  const query = typeof req.query === "string" ? req.query.trim() : "";
  const topK = Math.min(Math.max(req.top_k ?? DEFAULT_TOP_K, 1), MAX_TOP_K);
  const threshold = Math.max(req.threshold ?? DEFAULT_THRESHOLD, 0);
  const requestedApps =
    Array.isArray(req.apps) && req.apps.length > 0
      ? new Set(req.apps)
      : null;

  if (query === "") {
    return { hits: [], semantic_used: false };
  }

  // Lazy-prepare embeddings before reading the catalog so the rows we read
  // already carry up-to-date vectors. No-op if embeddings aren't available
  // on this host — search falls back to BM25 transparently in that case.
  await prepareEmbeddings(catalog);

  const allRows = await catalog.listAll();
  const inScopeRows = requestedApps
    ? allRows.filter((r) => requestedApps.has(r.service))
    : allRows;

  if (inScopeRows.length === 0) {
    return { hits: [], semantic_used: false };
  }

  const indexable: ToolIndexable[] = inScopeRows.map((r) => ({
    service: r.service,
    toolName: r.toolName,
    description: r.description,
    paramText: buildParamText(r.inputSchema ?? {}),
  }));
  const bm25 = new BM25Search(indexable);

  const semantic = await tryBuildSemantic(inScopeRows, indexable);
  const semanticUsed = semantic !== null;

  const overfetch = topK * OVERFETCH;
  const bm25Hits = bm25.search(query, overfetch);

  type FusedHit = {
    tool: ToolIndexable;
    score: number;
    contributions?: Record<string, number>;
  };

  let fused: FusedHit[];

  if (semantic) {
    const qv = await semantic.embedQuery(query);
    const semHits = semantic.index.search(qv, overfetch);
    const id = (t: ToolIndexable) => `${t.service}::${t.toolName}`;
    const rrf = reciprocalRankFusion(
      {
        bm25: bm25Hits.map((h, i) => ({ id: id(h.tool), item: h.tool, rank: i })),
        semantic: semHits.map((h, i) => ({
          id: id(h.tool),
          item: h.tool,
          rank: i,
        })),
      },
      { topK: overfetch },
    );
    fused = rrf.map((r) => ({
      tool: r.item,
      score: r.score,
      contributions: r.contributions,
    }));
  } else {
    fused = bm25Hits.map((h) => ({ tool: h.tool, score: h.score }));
  }

  const filteredByThreshold = fused.filter((h) => h.score >= threshold);
  const top = filteredByThreshold.slice(0, topK);

  // Catalog row cache so we don't hit SQLite N times.
  const byKey = new Map<string, (typeof allRows)[number]>();
  for (const r of allRows) byKey.set(`${r.service}::${r.toolName}`, r);

  const hits: ToolHit[] = [];
  for (const f of top) {
    const row = byKey.get(`${f.tool.service}::${f.tool.toolName}`);
    if (!row) continue;
    const shape = summarizeSchema(row.inputSchema ?? {});
    const hit: ToolHit = {
      app: row.service,
      tool: row.toolName,
      score: f.score,
      description: row.description,
      input_schema: row.inputSchema ?? {},
      required_params: shape.required,
      optional_params: shape.optional,
    };
    if (f.contributions) hit.ranker_contributions = f.contributions;
    hits.push(hit);
  }

  return { hits, semantic_used: semanticUsed };
}

interface SemanticContext {
  index: SemanticSearch<ToolIndexable>;
  embedQuery: (q: string) => Promise<Float32Array>;
}

// Best-effort semantic-index construction. Returns null if embeddings are
// unavailable on this host (Windows, download failed) OR if not every
// in-scope catalog row has an embedding yet — we don't want to score against
// a partial index. Re-running `search` after `prepareEmbeddings` populates
// any rows lacking a vector.
async function tryBuildSemantic(
  rows: Awaited<ReturnType<Catalog["listAll"]>>,
  indexable: ToolIndexable[],
): Promise<SemanticContext | null> {
  const ensure = await ensureEmbeddings();
  if (!ensure.available) return null;

  const allHaveEmbeddings = rows.every((r) => r.embedding != null);
  if (!allHaveEmbeddings) return null;

  try {
    const embedder = await getEmbedder();
    // biome-ignore lint/style/noNonNullAssertion: guarded above
    const vectors = rows.map((r) => r.embedding!);
    const index = new SemanticSearch(indexable, vectors);
    return {
      index,
      embedQuery: async (q) => (await embedder.embed([q]))[0],
    };
  } catch {
    // Embedder init failed (rare — usually means the dylib couldn't load).
    // Don't propagate; BM25-only is the graceful fallback.
    return null;
  }
}

/**
 * Idempotent lazy-prep run before each search. Two steps, both no-ops on
 * the happy path:
 *
 *  1. If the binary's `EMBEDDING_TEXT_VERSION` is newer than what the
 *     catalog last embedded against, wipe all stored vectors. The text
 *     shape (toolName/desc/params) changed and the old vectors are noise.
 *  2. Embed every catalog row whose vector is NULL. Covers both newly
 *     connected apps (no embeddings yet) and step-1 wipes.
 *
 * Failure at any stage is silent: search falls back to BM25 if the
 * embedder/model isn't there. ensureEmbeddings() handles the
 * download-on-first-use; this function is what fires it.
 */
async function prepareEmbeddings(catalog: Catalog): Promise<void> {
  const ensure = await ensureEmbeddings();
  if (!ensure.available) return;

  // Step 1: drop stale vectors after a text-shape bump.
  const storedRaw = await catalog.getMeta(EMBEDDING_TEXT_VERSION_META_KEY);
  const stored = storedRaw == null ? 0 : Number(storedRaw);
  if (!Number.isFinite(stored) || stored < EMBEDDING_TEXT_VERSION) {
    await catalog.clearAllEmbeddings();
    await catalog.setMeta(
      EMBEDDING_TEXT_VERSION_META_KEY,
      String(EMBEDDING_TEXT_VERSION),
    );
  }

  // Step 2: fill in missing vectors.
  const missing = await catalog.listNeedingEmbedding();
  if (missing.length === 0) return;

  let embedder: Awaited<ReturnType<typeof getEmbedder>>;
  try {
    embedder = await getEmbedder();
  } catch {
    // Cache might still be downloading on a slow first run; BM25-only this
    // turn, next turn picks up where we left off.
    return;
  }

  const texts = missing.map((r) =>
    buildEmbeddingText({
      toolName: r.toolName,
      description: r.description,
      inputSchema: r.inputSchema,
    }),
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
