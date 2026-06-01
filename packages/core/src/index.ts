// Public surface of @tensor-mcp/core. Anything not re-exported here is
// implementation detail. Keep this file alphabetically grouped by domain
// so a glance tells you where a name lives.

// ─── auth ────────────────────────────────────────────────────────────────────
export * from "./auth";
export type {
  AuthIO,
  AuthMethod,
  AuthStrategy,
  ConnectOptions,
  FieldSpec,
} from "./auth/types";
// Re-export the SDK's auth-server metadata type so service entries can declare
// `staticOAuthAuth` configs without a direct SDK dependency.
export type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";

// ─── bootstrap (catalog reconcile on registry-shape change) ──────────────────
export {
  bootstrap,
  computeContractHash,
  type BootstrapOptions,
} from "./bootstrap";

// ─── catalog ─────────────────────────────────────────────────────────────────
export * from "./catalog";

// ─── embeddings ──────────────────────────────────────────────────────────────
export { getEmbedder, type Embedder } from "./embeddings/embedder";
export {
  ensureEmbeddings,
  embeddingsCacheDir,
  type EnsureResult,
} from "./embeddings/ensure";

// ─── meta-tool implementations (what `tensor-mcp serve` exposes) ─────────────
// Five files, one per CLI verb: apps, connect, disconnect, execute, search.
export * from "./mcp";

// ─── search algorithm primitives (BM25, semantic, RRF, schema-summary) ───────
// The public `search()` facade is in ./mcp/search.ts; this barrel only
// re-exports the schema-summary helper that other consumers might want.
export {
  summarizeSchema,
  type InputShape,
  type ParamSummary,
} from "./search/schema-summary";

// ─── service abstraction + bundled registry ──────────────────────────────────
export { defineService, type Service } from "./defineService";
export {
  SERVICES,
  getService,
  listServices,
  listConnectableServices,
} from "./services";

// ─── stores (keychain, connections, in-memory test impl) ─────────────────────
export * from "./stores";
export type { KeyValueStore, TokenBundle } from "./stores/types";

// ─── transports (stdio subprocess + remote streamable HTTP) ──────────────────
export * from "./transports";
