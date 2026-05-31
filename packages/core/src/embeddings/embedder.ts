import { copyFileSync, existsSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ensureEmbeddings } from "./ensure";

/**
 * `all-MiniLM-L6-v2` Q8-quantized ONNX sentence embeddings.
 *
 * No bundled bytes — the model + dylib are downloaded into
 * `~/.tensor-mcp/embeddings/` on first use by `ensureEmbeddings()`. This
 * file's job is the platform plumbing:
 *
 *   1. Bun extracts the onnxruntime NAPI binding (.node) to `$TMPDIR/*.node`
 *      at startup.
 *   2. The dynamic linker (dyld on macOS, ld.so on Linux) resolves
 *      `@rpath/libonnxruntime…` references relative to the .node's
 *      directory — i.e. `$TMPDIR/libonnxruntime.…`. We copy the cached
 *      dylib to that exact path BEFORE fastembed loads.
 *   3. fastembed reads the model from `<cacheDir>/fast-all-MiniLM-L6-v2/`
 *      — the same dir `ensureEmbeddings` populated.
 *
 * Throws `EmbedderUnavailableError` if the cache isn't ready (Windows,
 * offline first run, download failure). Callers (`search.ts`,
 * `connect.ts`) catch this and fall back to BM25-only.
 */

export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
  readonly dim: number;
}

export class EmbedderUnavailableError extends Error {
  constructor(reason: string) {
    super(`embeddings unavailable: ${reason}`);
    this.name = "EmbedderUnavailableError";
  }
}

let initPromise: Promise<Embedder> | null = null;

export function getEmbedder(): Promise<Embedder> {
  if (!initPromise) initPromise = init();
  return initPromise;
}

async function init(): Promise<Embedder> {
  const probe = await ensureEmbeddings();
  if (!probe.available || !probe.cacheDir || !probe.runtimePath) {
    throw new EmbedderUnavailableError(probe.reason ?? "unknown");
  }

  await stageRuntimeForLoader(probe.runtimePath, probe.runtimeFilename ?? "");

  const { FlagEmbedding, EmbeddingModel } = await import("fastembed");
  const model = await FlagEmbedding.init({
    model: EmbeddingModel.AllMiniLML6V2,
    cacheDir: probe.cacheDir,
  });

  return {
    dim: 384,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const out: Float32Array[] = [];
      for await (const batch of model.embed(texts, 32)) {
        for (const v of batch) {
          out.push(
            v instanceof Float32Array ? v : Float32Array.from(v as number[]),
          );
        }
      }
      return out;
    },
  };
}

/**
 * Copy the cached onnxruntime library to a location the OS linker will
 * find. Three platform conventions:
 *
 *   • macOS — dyld resolves the `@rpath/libonnxruntime…` reference baked
 *     into the .node binding relative to the .node's directory (which Bun
 *     extracts to $TMPDIR at startup). Copy `libonnxruntime.1.21.0.dylib`
 *     to $TMPDIR.
 *
 *   • Linux — ld.so wants both the SONAME (`libonnxruntime.so.1`) and the
 *     versioned filename (`libonnxruntime.so.1.21.0`) in the same dir as
 *     the .node. Copy both to $TMPDIR.
 *
 *   • Windows — LoadLibrary checks the dir of the calling .node first.
 *     Copy `onnxruntime.dll` + `DirectML.dll` (delay-load reference) to
 *     $TMPDIR.
 *
 * Idempotent: `existsSync` short-circuits if a previous run already
 * staged the files.
 */
async function stageRuntimeForLoader(
  src: string,
  filename: string,
): Promise<void> {
  const dir = tmpdir();
  const dst = join(dir, filename);
  if (!existsSync(dst)) {
    copyFileSync(src, dst);
  }
  if (filename.endsWith(".so.1.21.0")) {
    const sonameDst = join(dir, "libonnxruntime.so.1");
    if (!existsSync(sonameDst)) copyFileSync(src, sonameDst);
  }
  if (platform() === "win32") {
    // DirectML.dll lives next to onnxruntime.dll in our cache layout.
    const directmlSrc = join(dirname(src), "DirectML.dll");
    const directmlDst = join(dir, "DirectML.dll");
    if (existsSync(directmlSrc) && !existsSync(directmlDst)) {
      copyFileSync(directmlSrc, directmlDst);
    }
  }
}
