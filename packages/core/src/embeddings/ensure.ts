import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { dirname, join } from "node:path";

/**
 * Downloads + verifies the semantic-search model and the platform-specific
 * `libonnxruntime` dylib on demand, caching them under
 * `~/.tensor-mcp/embeddings/`. Never throws — returns
 * `{available: false, reason}` so the caller (`search.ts`) can transparently
 * fall back to BM25-only.
 *
 * Layout under the cache dir:
 *
 *   embeddings/
 *     fast-all-MiniLM-L6-v2/      ← exact path fastembed looks for
 *       model.onnx
 *       tokenizer.json
 *       …
 *     runtime/
 *       libonnxruntime.1.21.0.dylib   (macOS) or .so.1.21.0 (Linux)
 *
 * Asset URLs live in the GitHub release `embeddings-v1` on the repo — see
 * `scripts/publish-embeddings.ts` for the publisher side. The manifest
 * holds SHA-256 + size + URL per file; we verify every download before
 * an atomic rename into place.
 */

const MANIFEST_URL =
  "https://github.com/shivammittal274/tensor-mcp/releases/download/embeddings-v1/manifest.json";
const CACHE_OVERRIDE_ENV = "TENSOR_MCP_EMBEDDINGS_DIR";

interface ManifestEntry {
  filename: string;
  url: string;
  sha256: string;
  size: number;
}

interface Manifest {
  version: string;
  /**
   * Model files. `dir` is the *relative* directory inside the cache root
   * — `fast-all-MiniLM-L6-v2/` is what fastembed expects.
   */
  model: { dir: string; files: ManifestEntry[] };
  /** Per `<platform>-<arch>` libonnxruntime asset, e.g. `darwin-arm64`. */
  runtimes: Record<string, ManifestEntry>;
}

export interface EnsureResult {
  available: boolean;
  /** Set when `available: false`. */
  reason?:
    | "unsupported-platform"
    | "manifest-fetch-failed"
    | "download-failed"
    | "offline";
  /** Set when `available: true`. fastembed reads from `<cacheDir>/fast-…/`. */
  cacheDir?: string;
  /** Set when `available: true`. Path to the libonnxruntime file on disk. */
  runtimePath?: string;
  /** Set when `available: true`. Filename the dynamic linker expects. */
  runtimeFilename?: string;
}

let memoized: Promise<EnsureResult> | null = null;

export function embeddingsCacheDir(): string {
  return process.env[CACHE_OVERRIDE_ENV] ?? join(homedir(), ".tensor-mcp", "embeddings");
}

export async function ensureEmbeddings(): Promise<EnsureResult> {
  if (memoized) return memoized;
  memoized = doEnsure();
  return memoized;
}

/**
 * Drop the memoized probe so the next `ensureEmbeddings()` re-evaluates.
 * Tests use this between cases — production code shouldn't need it because
 * the probe is deliberately a once-per-process decision.
 */
export function resetEnsureEmbeddingsCache(): void {
  memoized = null;
}

function platformKey(): string | null {
  if (platform() === "darwin" && arch() === "arm64") return "darwin-arm64";
  if (platform() === "darwin" && arch() === "x64") return "darwin-x64";
  if (platform() === "linux" && arch() === "x64") return "linux-x64";
  if (platform() === "linux" && arch() === "arm64") return "linux-arm64";
  return null;
}

async function doEnsure(): Promise<EnsureResult> {
  const target = platformKey();
  if (!target) {
    return { available: false, reason: "unsupported-platform" };
  }

  const cacheDir = embeddingsCacheDir();

  // Fast path: if both model + runtime are already cached, skip the network.
  // We trust the cache because every download path verifies SHA-256 before
  // atomic-renaming into place — a half-written file can't exist here.
  const cached = checkCacheComplete(cacheDir, target);
  if (cached) return cached;

  // Cold path: fetch manifest, download missing assets.
  let manifest: Manifest;
  try {
    manifest = await fetchManifest();
  } catch (err) {
    return {
      available: false,
      reason: looksOffline(err)
        ? "offline"
        : "manifest-fetch-failed",
    };
  }

  try {
    await downloadModelFiles(manifest, cacheDir);
    const runtime = manifest.runtimes[target];
    if (!runtime) {
      // Manifest exists but doesn't ship this arch — same UX as Windows.
      return { available: false, reason: "unsupported-platform" };
    }
    await downloadOne(runtime, join(cacheDir, "runtime"));
    return done(cacheDir, runtime.filename);
  } catch (err) {
    return {
      available: false,
      reason: looksOffline(err) ? "offline" : "download-failed",
    };
  }
}

function checkCacheComplete(cacheDir: string, target: string): EnsureResult | null {
  // Model: fastembed expects `fast-all-MiniLM-L6-v2/{model.onnx,tokenizer.json,…}`.
  const modelDir = join(cacheDir, "fast-all-MiniLM-L6-v2");
  if (!existsSync(join(modelDir, "model.onnx"))) return null;
  if (!existsSync(join(modelDir, "tokenizer.json"))) return null;

  // Runtime: filename varies by platform.
  const runtimeFilename =
    platform() === "darwin"
      ? "libonnxruntime.1.21.0.dylib"
      : "libonnxruntime.so.1.21.0";
  const runtimePath = join(cacheDir, "runtime", runtimeFilename);
  if (!existsSync(runtimePath)) return null;

  return done(cacheDir, runtimeFilename);
}

function done(cacheDir: string, runtimeFilename: string): EnsureResult {
  return {
    available: true,
    cacheDir,
    runtimePath: join(cacheDir, "runtime", runtimeFilename),
    runtimeFilename,
  };
}

async function fetchManifest(): Promise<Manifest> {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) {
    throw new Error(`manifest fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Manifest;
}

async function downloadModelFiles(
  manifest: Manifest,
  cacheDir: string,
): Promise<void> {
  const dir = join(cacheDir, manifest.model.dir);
  for (const entry of manifest.model.files) {
    await downloadOne(entry, dir);
  }
}

async function downloadOne(
  entry: ManifestEntry,
  dstDir: string,
): Promise<void> {
  const finalPath = join(dstDir, entry.filename);
  if (existsSync(finalPath)) return; // already cached

  mkdirSync(dstDir, { recursive: true });

  const res = await fetch(entry.url);
  if (!res.ok) {
    throw new Error(
      `download ${entry.url} failed: ${res.status} ${res.statusText}`,
    );
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  if (actualSha !== entry.sha256) {
    throw new Error(
      `sha256 mismatch for ${entry.filename}: expected ${entry.sha256.slice(0, 12)}…, got ${actualSha.slice(0, 12)}…`,
    );
  }

  // Atomic rename: write to .part, fsync-ish, then move into place. Never
  // leave a half-written file the next call would happily skip.
  const partPath = `${finalPath}.part`;
  mkdirSync(dirname(partPath), { recursive: true });
  writeFileSync(partPath, bytes);
  renameSync(partPath, finalPath);
}

function looksOffline(err: unknown): boolean {
  const msg = (err as Error)?.message?.toLowerCase() ?? "";
  return (
    msg.includes("network") ||
    msg.includes("getaddrinfo") ||
    msg.includes("enotfound") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout")
  );
}
