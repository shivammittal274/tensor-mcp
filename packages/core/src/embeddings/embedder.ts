import { existsSync, statSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
// Embedded at compile time. `libs/active/runtime` is staged by
// scripts/build.ts to the right `libonnxruntime.<ver>.{dylib,so.<ver>}` for
// the target — only ONE platform's runtime ships in each binary. For Windows
// builds we stage a 22-byte placeholder ("TENSOR_MCP_NO_RUNTIME") that this
// file detects + treats as "no runtime → fall back to BM25".
import runtimeBytes from "./libs/active/runtime" with { type: "file" };
import modelFile from "./model/model_quantized.onnx" with { type: "file" };
// @ts-expect-error — `with { type: "file" }` yields a string path; tsc
// auto-resolves JSON as parsed objects (resolveJsonModule).
import tokenizerFile from "./model/tokenizer.json" with { type: "file" };
// @ts-expect-error
import tokenizerConfigFile from "./model/tokenizer_config.json" with {
  type: "file",
};
// @ts-expect-error
import specialTokensFile from "./model/special_tokens_map.json" with {
  type: "file",
};
// @ts-expect-error
import configFile from "./model/config.json" with { type: "file" };
import vocabFile from "./model/vocab.txt" with { type: "file" };

/**
 * `all-MiniLM-L6-v2` Q8-quantized ONNX sentence embeddings.
 *
 * Per-platform binaries embed exactly one libonnxruntime variant + the
 * quantized model + tokenizer artifacts. No network, no first-run download
 * for the embedded surface today.
 *
 * The platform dance that makes ORT-native work inside `bun --compile`:
 *
 *  1. Bun extracts the ORT NAPI binding (.node) to `$TMPDIR/*.node`.
 *  2. The dynamic linker (dyld on macOS, ld.so on Linux) resolves
 *     `@rpath/libonnxruntime…` references relative to the .node's
 *     directory — i.e. `$TMPDIR/libonnxruntime.…`. We write our embedded
 *     runtime bytes to that exact path BEFORE fastembed loads.
 *  3. fastembed resolves models from `~/.tensor-mcp/embeddings/` — we
 *     pre-populate that directory from the embedded model so the
 *     fastembed HuggingFace download is skipped.
 *
 * Throws `EmbedderUnavailableError` on Windows or other platforms that
 * shipped without a runtime. Callers (the search pipeline) catch this
 * + fall back to BM25-only.
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

const PLACEHOLDER_MARKER = "TENSOR_MCP_NO_RUNTIME";

async function init(): Promise<Embedder> {
  await ensureRuntimeAvailable();
  const cacheDir = await populateModelCache();

  const { FlagEmbedding, EmbeddingModel } = await import("fastembed");
  const model = await FlagEmbedding.init({
    model: EmbeddingModel.AllMiniLML6V2,
    cacheDir,
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

function runtimeFilenameForHost(): string {
  if (platform() === "darwin") return "libonnxruntime.1.21.0.dylib";
  if (platform() === "linux") return "libonnxruntime.so.1.21.0";
  throw new EmbedderUnavailableError(`platform '${platform()}' not supported`);
}

async function ensureRuntimeAvailable(): Promise<void> {
  // Cheap placeholder check: scripts/build.ts writes a 22-byte sentinel for
  // Windows builds (which don't ship an onnxruntime native binding). Treat
  // it as unavailable so search.ts falls back to BM25-only.
  const sz = statSync(runtimeBytes).size;
  if (sz < 1024) {
    const peek = new Uint8Array(await Bun.file(runtimeBytes).arrayBuffer());
    const decoder = new TextDecoder();
    if (decoder.decode(peek).startsWith(PLACEHOLDER_MARKER)) {
      throw new EmbedderUnavailableError("runtime not bundled for this build");
    }
  }

  const dir = tmpdir();
  const dst = join(dir, runtimeFilenameForHost());
  const bytes = new Uint8Array(await Bun.file(runtimeBytes).arrayBuffer());
  if (!existsSync(dst)) writeFileSync(dst, bytes);

  // Linux .node bindings link against `libonnxruntime.so.1` (the SONAME),
  // which on a normal install is a symlink to .so.1.21.0. Bun.embedFile
  // can't ship symlinks, so we copy the same bytes under both names.
  if (platform() === "linux") {
    const sonameDst = join(dir, "libonnxruntime.so.1");
    if (!existsSync(sonameDst)) writeFileSync(sonameDst, bytes);
  }
}

async function populateModelCache(): Promise<string> {
  const cacheDir = join(homedir(), ".tensor-mcp", "embeddings");
  const modelDir = join(cacheDir, "fast-all-MiniLM-L6-v2");
  await mkdir(modelDir, { recursive: true });

  const files: Array<[string, string]> = [
    [modelFile, "model.onnx"],
    [tokenizerFile, "tokenizer.json"],
    [tokenizerConfigFile, "tokenizer_config.json"],
    [specialTokensFile, "special_tokens_map.json"],
    [configFile, "config.json"],
    [vocabFile, "vocab.txt"],
  ];
  for (const [srcRef, dstName] of files) {
    const dst = join(modelDir, dstName);
    if (existsSync(dst)) continue;
    const bytes = new Uint8Array(await Bun.file(srcRef).arrayBuffer());
    writeFileSync(dst, bytes);
  }
  return cacheDir;
}
