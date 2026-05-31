// Public search surface — there's exactly ONE entry point. Everything else
// (BM25, semantic, RRF) is an implementation detail.
export {
  search,
  type SearchRequest,
  type SearchResult,
  type ToolHit,
  type MissingConnection,
  type SearchDeps,
} from "./search";
export {
  summarizeSchema,
  type InputShape,
  type ParamSummary,
} from "./schema-summary";
