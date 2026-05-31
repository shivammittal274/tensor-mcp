import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
// Embedded artifacts — all bundled into the compiled binary so there's no
// first-run download. ~23 MB total (22 MB quantized ONNX + 1 MB tokenizer).
import dylibFile from "./libs/libonnxruntime.1.21.0.dylib" with { type: "file" };
import modelFile from "./model/model_quantized.onnx" with { type: "file" };
// `with { type: "file" }` gives Bun-only string paths at runtime; tsc sees
// the JSON imports as parsed objects (because `resolveJsonModule` is on),
// so suppress the mismatch here.
// @ts-expect-error
import tokenizerFile from "./model/tokenizer.json" with { type: "file" };
// @ts-expect-error
import tokenizerConfigFile from "./model/tokenizer_config.json" with { type: "file" };
// @ts-expect-error
import specialTokensFile from "./model/special_tokens_map.json" with { type: "file" };
// @ts-expect-error
import configFile from "./model/config.json" with { type: "file" };
import vocabFile from "./model/vocab.txt" with { type: "file" };

/**
 * `all-MiniLM-L6-v2` ONNX (Q8 quantized) sentence embeddings, fully bundled.
 *
 * The compiled binary ships the ORT dylib + the quantized model + the
 * tokenizer artifacts. First search: ~250 ms extraction + WASM warmup;
 * no network needed.
 *
 * Two extraction steps make this work in `bun --compile`:
 *
 *  1. Bun extracts the ORT `.node` NAPI binding to `$TMPDIR/*.node`.
 *     macOS dyld then resolves `@rpath/libonnxruntime.X.dylib` relative
 *     to the .node's location — so we write our embedded dylib to
 *     `$TMPDIR/libonnxruntime.1.21.0.dylib` BEFORE requiring fastembed.
 *
 *  2. fastembed checks `<cacheDir>/<model_name>/model.onnx` and downloads
 *     if missing. We pre-populate that path from the embedded quantized
 *     model + tokenizer so the download step is skipped.
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
  await ensureDylibAvailable();
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
      // batch=32 keeps RAM bounded under ingest of 600+ tools. fastembed
      // yields `number[]` per text; convert to Float32Array so downstream
      // cosine math doesn't pay per-element type conversion.
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

async function ensureDylibAvailable(): Promise<void> {
  if (platform() !== "darwin") {
    throw new Error(
      `Embeddings unavailable on '${platform()}'. Build with the appropriate libonnxruntime for your platform.`,
    );
  }
  const dylibPath = join(tmpdir(), "libonnxruntime.1.21.0.dylib");
  if (existsSync(dylibPath)) return;
  writeFileSync(
    dylibPath,
    new Uint8Array(await Bun.file(dylibFile).arrayBuffer()),
  );
}

/**
 * Pre-populate the fastembed cache so its first-run download is skipped.
 * Layout mirrors what fastembed expects: `<cacheDir>/fast-<modelName>/`.
 *
 * Returns the parent cacheDir to hand to `FlagEmbedding.init({ cacheDir })`.
 */
async function populateModelCache(): Promise<string> {
  const cacheDir = join(homedir(), ".tensor-mcp", "embeddings");
  const modelDir = join(cacheDir, "fast-all-MiniLM-L6-v2");
  mkdirSync(modelDir, { recursive: true });

  // fastembed checks for model.onnx; we ship the Q8-quantized variant under
  // that filename. Quantization preserves output shape [seq, 384] — only
  // the per-weight precision differs (int8 vs fp32).
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
