// Algorithm primitives only — the public `search()` entry lives next to the
// other meta-tools in `core/src/mcp/search.ts`. This folder owns BM25, dense
// cosine, RRF fusion, and the schema-summary helper they all share.

export {
  summarizeSchema,
  type InputShape,
  type ParamSummary,
} from "./schema-summary";
