import type { Catalog } from "../catalog/catalog";
import type { BM25Search, SearchHit, ToolIndexable } from "../search/bm25";
import { reciprocalRankFusion } from "../search/rrf";
import { type ParamSummary, summarizeSchema } from "../search/schema-summary";
import type { SemanticSearch } from "../search/semantic";

export type Ranker = "bm25" | "semantic" | "rrf";

export interface SearchToolsRequest {
  query: string;
  topK?: number;
  services?: string[];
  /** Defaults to "rrf" when a semantic index is available, otherwise "bm25". */
  ranker?: Ranker;
}

export interface ToolHit {
  service: string;
  tool: string;
  score: number;
  description: string;
  input_schema: unknown;
  required_params: ParamSummary[];
  optional_params: ParamSummary[];
  connection_status: "active" | "missing";
  /** When ranker='rrf': per-ranker positions for transparency. */
  ranker_contributions?: Record<string, number>;
}

export interface MissingConnection {
  service: string;
  reason: string;
}

export interface SearchToolsResult {
  primary_tools: ToolHit[];
  missing_connections: MissingConnection[];
  /** Which ranker actually produced these results. */
  ranker_used: Ranker;
}

export interface SearchToolsDeps {
  searchIndex: Pick<BM25Search<ToolIndexable>, "search">;
  catalog: Pick<Catalog, "get">;
  isConnected: (service: string) => Promise<boolean>;
  /** Optional: dense-vector index. Required for `ranker: "semantic" | "rrf"`. */
  semanticIndex?: Pick<SemanticSearch<ToolIndexable>, "search">;
  /** Optional: embed the user query. Required for `ranker: "semantic" | "rrf"`. */
  embedQuery?: (query: string) => Promise<Float32Array>;
}

const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 20;
// Over-fetch each ranker so RRF has enough candidates to fuse meaningfully.
const RANKER_OVERFETCH = 4;

/**
 * Search ranking pipeline:
 *
 *  1. BM25+ keyword pass (always available).
 *  2. If a semantic index is wired in, also dense-vector cosine rank.
 *  3. Combine via Reciprocal Rank Fusion (RRF) — the union of "keyword
 *     precision" + "semantic recall". Both rankers contribute weighted
 *     by their position, no score calibration needed.
 *
 * `ranker` selects the pipeline at request time; default = "rrf" if
 * semantic is wired, else "bm25". This is also the toggle for the CLI's
 * `--ranker {bm25,semantic,rrf}` flag.
 */
export async function searchTools(
  req: SearchToolsRequest,
  deps: SearchToolsDeps,
): Promise<SearchToolsResult> {
  const query = typeof req.query === "string" ? req.query : "";
  const topK = Math.min(Math.max(req.topK ?? DEFAULT_TOP_K, 1), MAX_TOP_K);
  const servicesFilter =
    Array.isArray(req.services) && req.services.length > 0
      ? new Set(req.services)
      : null;

  const semanticAvailable = !!(deps.semanticIndex && deps.embedQuery);
  const ranker: Ranker =
    req.ranker ?? (semanticAvailable ? "rrf" : "bm25");

  if ((ranker === "semantic" || ranker === "rrf") && !semanticAvailable) {
    throw new Error(
      `ranker '${ranker}' requested but no semanticIndex/embedQuery wired`,
    );
  }

  const overfetch = topK * RANKER_OVERFETCH;
  const bm25Hits = deps.searchIndex.search(query, overfetch);

  let fusedHits: Array<{
    tool: ToolIndexable;
    score: number;
    contributions?: Record<string, number>;
  }>;

  if (ranker === "bm25") {
    fusedHits = bm25Hits;
  } else {
    const qv = await (deps.embedQuery as (q: string) => Promise<Float32Array>)(
      query,
    );
    const semHits = (
      deps.semanticIndex as Pick<SemanticSearch<ToolIndexable>, "search">
    ).search(qv, overfetch);

    if (ranker === "semantic") {
      fusedHits = semHits;
    } else {
      // rrf
      const id = (h: SearchHit<ToolIndexable>) =>
        `${h.tool.service}::${h.tool.toolName}`;
      const fused = reciprocalRankFusion(
        {
          bm25: bm25Hits.map((h, i) => ({ id: id(h), item: h.tool, rank: i })),
          semantic: semHits.map((h, i) => ({
            id: id(h),
            item: h.tool,
            rank: i,
          })),
        },
        { topK: overfetch },
      );
      fusedHits = fused.map((f) => ({
        tool: f.item,
        score: f.score,
        contributions: f.contributions,
      }));
    }
  }

  const filtered = servicesFilter
    ? fusedHits.filter((h) => servicesFilter.has(h.tool.service))
    : fusedHits;
  const top = filtered.slice(0, topK);

  const primary_tools: ToolHit[] = await Promise.all(
    top.map(async (h) => {
      const full = await deps.catalog.get(h.tool.service, h.tool.toolName);
      const connected = await deps.isConnected(h.tool.service);
      const schema = full?.inputSchema ?? {};
      const shape = summarizeSchema(schema);
      const hit: ToolHit = {
        service: h.tool.service,
        tool: h.tool.toolName,
        score: h.score,
        description: full?.description ?? "",
        input_schema: schema,
        required_params: shape.required,
        optional_params: shape.optional,
        connection_status: connected ? "active" : "missing",
      };
      if (h.contributions) hit.ranker_contributions = h.contributions;
      return hit;
    }),
  );

  const missingServices = [
    ...new Set(
      primary_tools
        .filter((t) => t.connection_status === "missing")
        .map((t) => t.service),
    ),
  ];
  const missing_connections: MissingConnection[] = missingServices.map(
    (service) => ({
      service,
      reason: `not connected. Run \`tensor-mcp connect ${service}\` first.`,
    }),
  );

  return { primary_tools, missing_connections, ranker_used: ranker };
}
