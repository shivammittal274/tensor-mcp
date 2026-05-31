import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
// Embedded at compile time. `libs/active/runtime` is set by scripts/build.sh
// to the right `libonnxruntime.<ver>.{dylib,so.<ver>}` for the target
// platform — only ONE platform's runtime ships in each binary.
import runtimeBytes from "./libs/active/runtime" with { type: "file" };
import modelFile from "./model/model_quantized.onnx" with { type: "file" };
// @ts-expect-error — Bun's `with { type: "file" }` yields a string path; tsc
// auto-resolves JSON imports to parsed objects (resolveJsonModule).
import tokenizerFile from "./model/tokenizer.json" with { type: "file" };
// @ts-expect-error
import tokenizerConfigFile from "./model/tokenizer_config.json" with { type: "file" };
// @ts-expect-error
import specialTokensFile from "./model/special_tokens_map.json" with { type: "file" };
// @ts-expect-error
import configFile from "./model/config.json" with { type: "file" };
import vocabFile from "./model/vocab.txt" with { type: "file" };

/**
 * `all-MiniLM-L6-v2` Q8-quantized ONNX sentence embeddings, fully bundled.
 *
 * Per-platform binaries embed exactly one libonnxruntime variant + the
 * quantized model + tokenizer artifacts. No network, no first-run download.
 *
 * The platform dance that makes ORT-native work inside `bun --compile`:
 *
 *  1. Bun extracts the ORT NAPI binding (.node) to `$TMPDIR/*.node`.
 *  2. The dynamic linker (dyld on macOS, ld.so on Linux) resolves
 *     `@rpath/libonnxruntime…` references relative to the .node's
 *     directory — i.e. `$TMPDIR/libonnxruntime.…`. So we write our
 *     embedded runtime bytes to that exact path BEFORE fastembed loads.
 *  3. fastembed then resolves models from `~/.tensor-mcp/embeddings/` —
 *     we pre-populate that directory from the embedded model so the
 *     fastembed HuggingFace download is skipped.
 */

let initPromise: Promise<Embedder> | null = null;

export interface Embedder {
  embed(texts: string[]): Promise<Float32Array[]>;
  readonly dim: number;
}

export function getEmbedder(): Promise<Embedder> {
  if (!initPromise) initPromise = init();
  return initPromise;
}

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

/**
 * Filename the dynamic linker expects, per platform. The actual *bytes*
 * came from the build-time-active runtime; only the on-disk name varies.
 */
function runtimeFilenameForHost(): string {
  if (platform() === "darwin") return "libonnxruntime.1.21.0.dylib";
  if (platform() === "linux") return "libonnxruntime.so.1.21.0";
  throw new Error(
    `Embeddings unavailable on '${platform()}'. Build with the appropriate libonnxruntime for your platform.`,
  );
}

async function ensureRuntimeAvailable(): Promise<void> {
  const dir = tmpdir();
  const dst = join(dir, runtimeFilenameForHost());
  const bytes = new Uint8Array(await Bun.file(runtimeBytes).arrayBuffer());
  if (!existsSync(dst)) writeFileSync(dst, bytes);

  // Linux .node bindings link against `libonnxruntime.so.1` (the SONAME),
  // which on a normal install is a symlink to the .so.1.21.0 file. We can't
  // ship symlinks through Bun.embedFile, so we copy the same bytes under
  // both names. Identical content, ~21 MB extra on disk in $TMPDIR — fine.
  if (platform() === "linux") {
    const sonameDst = join(dir, "libonnxruntime.so.1");
    if (!existsSync(sonameDst)) writeFileSync(sonameDst, bytes);
  }
}

/**
 * Pre-populate the fastembed cache so its first-run download is skipped.
 * Layout mirrors what fastembed expects: `<cacheDir>/fast-<modelName>/`.
 */
async function populateModelCache(): Promise<string> {
  const cacheDir = join(homedir(), ".tensor-mcp", "embeddings");
  const modelDir = join(cacheDir, "fast-all-MiniLM-L6-v2");
  mkdirSync(modelDir, { recursive: true });

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
