import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
// macOS arm64 dylib — embedded directly in the compiled binary.
// TODO: build-time selection for other platforms.
import dylibFile from "./libs/libonnxruntime.1.21.0.dylib" with { type: "file" };

/**
 * `all-MiniLM-L6-v2` ONNX (Q8 quantized) sentence embeddings.
 *
 * Compiled binary embeds the ORT dylib + tokenizer here; the model itself
 * (22 MB) downloads to `~/.tensor-mcp/embeddings/` on first use to keep the
 * baseline binary download small. Subsequent searches are fully offline.
 *
 * The dylib-extraction dance is what makes this work in `bun --compile`:
 * Bun extracts the `.node` NAPI binding to `$TMPDIR/*.node`. macOS dyld
 * then resolves the `@rpath/libonnxruntime.X.dylib` reference relative to
 * the .node's location — so we write our embedded dylib to `$TMPDIR`
 * BEFORE requiring fastembed. Without this, dlopen fails because the
 * dynamic library isn't on any standard search path inside the
 * compiled-binary's virtual FS (`/$bunfs/`).
 */

// One-time process-wide setup. Done once across many embed calls.
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
  // Dynamic import so the static bundler only follows fastembed when this
  // module is exercised — keeps `tensor-mcp` startup cold-path free of ORT.
  const { FlagEmbedding, EmbeddingModel } = await import("fastembed");
  const cacheDir = join(homedir(), ".tensor-mcp", "embeddings");
  mkdirSync(cacheDir, { recursive: true });

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
          out.push(v instanceof Float32Array ? v : Float32Array.from(v as number[]));
        }
      }
      return out;
    },
  };
}

async function ensureDylibAvailable(): Promise<void> {
  // Platform guard — we currently only embed the macOS arm64 dylib.
  // Other platforms will need their dylib downloaded at runtime or
  // embedded via a build-script switch (see scripts/build.sh).
  if (platform() !== "darwin") {
    throw new Error(
      `Embeddings unavailable on '${platform()}'. Build with the appropriate libonnxruntime for your platform.`,
    );
  }

  const dylibPath = join(tmpdir(), "libonnxruntime.1.21.0.dylib");
  if (existsSync(dylibPath)) return;

  const bytes = new Uint8Array(await Bun.file(dylibFile).arrayBuffer());
  writeFileSync(dylibPath, bytes);
}
