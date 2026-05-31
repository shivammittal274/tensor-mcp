import { homedir, platform } from "node:os";
import { join } from "node:path";
import {
  EmbedderUnavailableError,
  getEmbedder,
} from "./embedder";

/**
 * Probes whether semantic embeddings are available. Designed to never throw
 * — search.ts uses the boolean to pick RRF (BM25 + semantic) vs BM25-only.
 *
 * The probe is best-effort: it tries to init the embedder once. Subsequent
 * calls return the memoized result. If init throws (Windows, dylib missing,
 * onnxruntime mismatch), `available: false` is the answer — no error
 * surfaces to user code.
 *
 * v2 plan (separate commit): replace the Bun.embedFile model + dylib with
 * a first-run download into `embeddingsCacheDir()` so the binary stays
 * small and Windows can opt-in by dropping a dylib in the cache dir.
 */
export interface EnsureResult {
  available: boolean;
  /** Machine-readable hint when `available: false`. */
  reason?: "unsupported-platform" | "runtime-missing" | "init-failed";
}

const CACHE_OVERRIDE_ENV = "TENSOR_MCP_EMBEDDINGS_DIR";

let memoized: Promise<EnsureResult> | null = null;

export async function ensureEmbeddings(): Promise<EnsureResult> {
  if (memoized) return memoized;
  memoized = doProbe();
  return memoized;
}

async function doProbe(): Promise<EnsureResult> {
  if (platform() === "win32") {
    return { available: false, reason: "unsupported-platform" };
  }
  try {
    await getEmbedder();
    return { available: true };
  } catch (err) {
    if (err instanceof EmbedderUnavailableError) {
      return { available: false, reason: "runtime-missing" };
    }
    return { available: false, reason: "init-failed" };
  }
}

/**
 * Where downloaded model + dylib bytes live (currently unused — the v1
 * embedder reads from the in-binary `Bun.embedFile` artifacts). The v2
 * download path will write here. Honors `TENSOR_MCP_EMBEDDINGS_DIR` for
 * power users + tests.
 */
export function embeddingsCacheDir(): string {
  const override = process.env[CACHE_OVERRIDE_ENV];
  if (override) return override;
  return join(homedir(), ".tensor-mcp", "embeddings");
}
