#!/usr/bin/env bun
/*
 * scripts/publish-embeddings.ts — one-shot publisher for the model + dylib
 * assets that ensureEmbeddings() downloads on first use.
 *
 * Reads the per-platform onnxruntime dylibs from
 *   packages/core/src/embeddings/libs/<plat>/
 * and the quantized ONNX model + tokenizer files from
 *   packages/core/src/embeddings/model/
 *
 * Computes SHA-256 + size for each, builds `dist/manifest.json` matching the
 * shape `core/src/embeddings/ensure.ts` expects, and uploads everything to
 * the `embeddings-v1` GitHub release (created if missing) via `gh`.
 *
 * Usage:
 *   bun run scripts/publish-embeddings.ts            # uploads
 *   bun run scripts/publish-embeddings.ts --dry-run  # just builds manifest
 *
 * Prereqs:
 *   - `gh` CLI authenticated against shivammittal274/tensor-mcp
 *   - Existing libs/<plat>/* and model/* files in the repo
 *
 * After a successful run, the libs/ + model/ trees can be deleted from the
 * working tree — the binary no longer reads them.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SRC_LIBS = join(REPO_ROOT, "packages/core/src/embeddings/libs");
const SRC_MODEL = join(REPO_ROOT, "packages/core/src/embeddings/model");
const OUT_DIR = join(REPO_ROOT, "dist/embeddings-v1");
const RELEASE_TAG = "embeddings-v1";
const RELEASE_BASE_URL = `https://github.com/shivammittal274/tensor-mcp/releases/download/${RELEASE_TAG}`;

const MODEL_FILES = [
  "model_quantized.onnx",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "config.json",
  "vocab.txt",
];

type Platform = "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64";

const RUNTIMES: Record<Platform, string> = {
  "darwin-arm64": "darwin-arm64/libonnxruntime.1.21.0.dylib",
  "darwin-x64": "darwin-x64/libonnxruntime.1.21.0.dylib",
  "linux-x64": "linux-x64/libonnxruntime.so.1.21.0",
  "linux-arm64": "linux-arm64/libonnxruntime.so.1.21.0",
};

interface ManifestEntry {
  filename: string;
  url: string;
  sha256: string;
  size: number;
}

interface Manifest {
  version: string;
  model: { dir: string; files: ManifestEntry[] };
  runtimes: Record<string, ManifestEntry>;
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function buildEntry(src: string, releaseFilename: string): ManifestEntry {
  return {
    filename: releaseFilename,
    url: `${RELEASE_BASE_URL}/${releaseFilename}`,
    sha256: sha256(src),
    size: statSync(src).size,
  };
}

function buildManifest(): Manifest {
  const modelEntries: ManifestEntry[] = MODEL_FILES.map((name) => {
    const src = join(SRC_MODEL, name);
    if (!existsSync(src)) {
      throw new Error(`missing model file: ${src}`);
    }
    // `model_quantized.onnx` → ship as `model.onnx` so fastembed picks it up.
    const releaseName = name === "model_quantized.onnx" ? "model.onnx" : name;
    return buildEntry(src, releaseName);
  });

  const runtimes: Record<string, ManifestEntry> = {};
  for (const [plat, rel] of Object.entries(RUNTIMES) as [Platform, string][]) {
    const src = join(SRC_LIBS, rel);
    if (!existsSync(src)) {
      throw new Error(`missing runtime for ${plat}: ${src}`);
    }
    // Flat layout in the release: `libonnxruntime-<plat>.<ext>`.
    const ext = rel.endsWith(".dylib") ? "dylib" : "so";
    const releaseName = `libonnxruntime-${plat}.${ext}`;
    runtimes[plat] = {
      ...buildEntry(src, releaseName),
      // Override `.filename` to the name dyld/ld.so wants AT RUNTIME — the
      // download is renamed-on-arrival to this. Distinct from the release
      // asset's own URL filename.
      filename: rel.endsWith(".dylib")
        ? "libonnxruntime.1.21.0.dylib"
        : "libonnxruntime.so.1.21.0",
    };
    // Re-derive the release URL using the *upload* name, not the runtime name.
    runtimes[plat].url = `${RELEASE_BASE_URL}/${releaseName}`;
  }

  return {
    version: "v1",
    model: { dir: "fast-all-MiniLM-L6-v2", files: modelEntries },
    runtimes,
  };
}

function stageAssets(manifest: Manifest): string[] {
  mkdirSync(OUT_DIR, { recursive: true });
  const staged: string[] = [];

  for (const entry of manifest.model.files) {
    const src =
      entry.filename === "model.onnx"
        ? join(SRC_MODEL, "model_quantized.onnx")
        : join(SRC_MODEL, entry.filename);
    const dst = join(OUT_DIR, entry.filename);
    writeFileSync(dst, readFileSync(src));
    staged.push(dst);
  }

  for (const [plat, entry] of Object.entries(manifest.runtimes)) {
    const src = join(SRC_LIBS, RUNTIMES[plat as Platform]);
    const releaseName = entry.url.split("/").pop() as string;
    const dst = join(OUT_DIR, releaseName);
    writeFileSync(dst, readFileSync(src));
    staged.push(dst);
  }

  const manifestPath = join(OUT_DIR, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  staged.push(manifestPath);

  return staged;
}

function gh(args: string[], { check = true } = {}): { code: number; stdout: string; stderr: string } {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (check && result.status !== 0) {
    throw new Error(
      `gh ${args.join(" ")} failed (${result.status}):\n${result.stderr}`,
    );
  }
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function publish(assets: string[]): void {
  // Idempotent: if the release exists, append/replace; else create it.
  const existing = gh(["release", "view", RELEASE_TAG], { check: false });
  if (existing.code === 0) {
    process.stderr.write(`Updating existing release ${RELEASE_TAG}...\n`);
    gh(["release", "upload", RELEASE_TAG, ...assets, "--clobber"]);
  } else {
    process.stderr.write(`Creating release ${RELEASE_TAG}...\n`);
    gh([
      "release",
      "create",
      RELEASE_TAG,
      ...assets,
      "--title",
      "tensor-mcp embeddings v1 (model + onnxruntime per platform)",
      "--notes",
      "Downloaded on first use by tensor-mcp's embedder. See scripts/publish-embeddings.ts.",
    ]);
  }
  process.stderr.write(`Done. ${assets.length} assets uploaded to ${RELEASE_TAG}.\n`);
}

function main(): void {
  const dryRun = process.argv.includes("--dry-run");
  const manifest = buildManifest();
  const assets = stageAssets(manifest);

  process.stderr.write(`Staged ${assets.length} assets to ${OUT_DIR}:\n`);
  for (const a of assets) {
    process.stderr.write(`  ${a}\n`);
  }
  process.stderr.write(`Manifest:\n${JSON.stringify(manifest, null, 2)}\n`);

  if (dryRun) {
    process.stderr.write("--dry-run: skipping upload.\n");
    return;
  }
  publish(assets);
}

try {
  main();
} catch (err) {
  process.stderr.write(`publish-embeddings: ${(err as Error).message}\n`);
  process.exit(1);
}
