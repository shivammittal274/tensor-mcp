import { existsSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { join } from "node:path";

/**
 * Cache-only probe for the embeddings model + libonnxruntime.
 *
 * Never touches the network, never downloads anything — it just answers
 * "are the files on disk?" `tensor-mcp search` calls this once per query
 * and falls back to BM25-only when the answer is no.
 *
 * The actual download happens in `install.sh` (right after the binary is
 * placed on PATH) so the one-time ~100 MB pause lands at install time
 * rather than on the first user search. If the user installed via any
 * mechanism that didn't run `install.sh` (downloaded the binary by hand,
 * blew away `~/.tensor-mcp/embeddings/`, …), search keeps working — just
 * with the BM25 ranker only. They can re-run `install.sh` to get
 * semantic ranking back.
 *
 * Cache layout under `embeddingsCacheDir()`:
 *
 *   embeddings/
 *     fast-all-MiniLM-L6-v2/      ← exact path fastembed looks for
 *       model.onnx
 *       tokenizer.json
 *     runtime/
 *       libonnxruntime.1.21.0.dylib   (macOS) or .so.1.21.0 (Linux)
 */

const CACHE_OVERRIDE_ENV = "TENSOR_MCP_EMBEDDINGS_DIR";

export interface EnsureResult {
  available: boolean;
  /** Set when `available: false`. */
  reason?: "unsupported-platform" | "not-installed";
  /** Set when `available: true`. fastembed reads from `<cacheDir>/fast-…/`. */
  cacheDir?: string;
  /** Set when `available: true`. Path to the libonnxruntime file on disk. */
  runtimePath?: string;
  /** Set when `available: true`. Filename the dynamic linker expects. */
  runtimeFilename?: string;
}

let memoized: EnsureResult | null = null;

export function embeddingsCacheDir(): string {
  return process.env[CACHE_OVERRIDE_ENV] ?? join(homedir(), ".tensor-mcp", "embeddings");
}

/**
 * Memoized for the lifetime of the process — call sites can hit it once
 * per query without worrying about repeated `fs.statSync` overhead.
 *
 * Returns a Promise to preserve the historic signature `search` already
 * awaits, but the body is sync: there's no network or disk wait inside.
 */
export async function ensureEmbeddings(): Promise<EnsureResult> {
  if (memoized) return memoized;
  const target = platformKey();
  if (!target) {
    memoized = { available: false, reason: "unsupported-platform" };
    return memoized;
  }
  const cached = checkCacheComplete(embeddingsCacheDir());
  memoized = cached ?? { available: false, reason: "not-installed" };
  return memoized;
}

/**
 * Drop the memoized probe so the next `ensureEmbeddings()` re-evaluates.
 * Tests use this between cases — production code shouldn't need it.
 */
export function resetEnsureEmbeddingsCache(): void {
  memoized = null;
}

function platformKey(): string | null {
  if (platform() === "darwin" && arch() === "arm64") return "darwin-arm64";
  if (platform() === "darwin" && arch() === "x64") return "darwin-x64";
  if (platform() === "linux" && arch() === "x64") return "linux-x64";
  if (platform() === "linux" && arch() === "arm64") return "linux-arm64";
  if (platform() === "win32" && arch() === "x64") return "win32-x64";
  if (platform() === "win32" && arch() === "arm64") return "win32-arm64";
  return null;
}

/**
 * Canonical local filename for the onnxruntime shared library on this
 * platform. The shape that the napi-v3 binding (extracted by Bun at
 * startup) tries to dlopen / LoadLibrary.
 */
function runtimeFilenameForPlatform(): string | null {
  if (platform() === "darwin") return "libonnxruntime.1.21.0.dylib";
  if (platform() === "linux") return "libonnxruntime.so.1.21.0";
  if (platform() === "win32") return "onnxruntime.dll";
  return null;
}

function checkCacheComplete(cacheDir: string): EnsureResult | null {
  // Model: fastembed expects `fast-all-MiniLM-L6-v2/{model.onnx,tokenizer.json,…}`.
  const modelDir = join(cacheDir, "fast-all-MiniLM-L6-v2");
  if (!existsSync(join(modelDir, "model.onnx"))) return null;
  if (!existsSync(join(modelDir, "tokenizer.json"))) return null;

  const runtimeFilename = runtimeFilenameForPlatform();
  if (!runtimeFilename) return null;
  const runtimePath = join(cacheDir, "runtime", runtimeFilename);
  if (!existsSync(runtimePath)) return null;

  // Windows-only: the napi binding delay-loads DirectML.dll for the GPU
  // execution provider. We don't use GPU, but the import table reference
  // is resolved at load time on some Windows versions and missing the
  // file prevents the runtime from initializing. Always stage it.
  if (platform() === "win32") {
    if (!existsSync(join(cacheDir, "runtime", "DirectML.dll"))) return null;
  }

  return {
    available: true,
    cacheDir,
    runtimePath,
    runtimeFilename,
  };
}
