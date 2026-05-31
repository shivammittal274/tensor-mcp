import type { Catalog } from "../catalog/catalog";
import type { BM25Search, ToolIndexable } from "../search/bm25";
import { type ParamSummary, summarizeSchema } from "../search/schema-summary";

export interface SearchToolsRequest {
  query: string;
  topK?: number;
  services?: string[];
}

export interface ToolHit {
  service: string;
  tool: string;
  score: number;
  description: string;
  input_schema: unknown;
  /** Pre-extracted from input_schema. Caller can use these to call the tool
   *  correctly the first time without parsing the full JSON Schema. */
  required_params: ParamSummary[];
  optional_params: ParamSummary[];
  connection_status: "active" | "missing";
}

export interface MissingConnection {
  service: string;
  reason: string;
}

export interface SearchToolsResult {
  primary_tools: ToolHit[];
  missing_connections: MissingConnection[];
}

export interface SearchToolsDeps {
  searchIndex: Pick<BM25Search<ToolIndexable>, "search">;
  catalog: Pick<Catalog, "get">;
  isConnected: (service: string) => Promise<boolean>;
}

const DEFAULT_TOP_K = 8;
const MAX_TOP_K = 20;

/**
 * Run BM25 + catalog hydration + connection-status overlay.
 *
 * The `isConnected` predicate decouples this from any specific storage
 * backend: tests inject fakes, runtime/cli pass a wrapper over a
 * ConnectionsStore lookup.
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

  const hits = deps.searchIndex.search(query, topK * 3);
  const filtered = servicesFilter
    ? hits.filter((h) => servicesFilter.has(h.tool.service))
    : hits;
  const top = filtered.slice(0, topK);

  const primary_tools: ToolHit[] = await Promise.all(
    top.map(async (h) => {
      const full = await deps.catalog.get(h.tool.service, h.tool.toolName);
      const connected = await deps.isConnected(h.tool.service);
      const schema = full?.inputSchema ?? {};
      const shape = summarizeSchema(schema);
      return {
        service: h.tool.service,
        tool: h.tool.toolName,
        score: h.score,
        description: full?.description ?? "",
        input_schema: schema,
        required_params: shape.required,
        optional_params: shape.optional,
        connection_status: connected ? "active" : "missing",
      };
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

  return { primary_tools, missing_connections };
}
