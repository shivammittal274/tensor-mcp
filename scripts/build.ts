#!/usr/bin/env bun
/*
 * scripts/build.ts — single source of truth for compiling tensor-mcp.
 *
 * Modes:
 *   bun run build                       → host platform
 *   bun run build --target=<plat>-<arch>  → cross-compile one target
 *   bun run build --all                 → every supported target
 *
 * Supported targets:
 *   darwin-arm64, darwin-x64, linux-x64, linux-arm64, windows-x64
 *
 * Windows ships as a BM25-only binary today — the onnxruntime native
 * binding hasn't been validated under `bun --compile` for win32 yet
 * (see Bun #18079). Semantic ranking falls back gracefully at runtime.
 *
 * Outputs land in `dist/`:
 *   tensor-mcp-<target>[.exe]   compiled binary
 *   SHA256SUMS                  one line per artifact
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { arch as hostArch, platform as hostPlatform } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

type Target =
  | "darwin-arm64"
  | "darwin-x64"
  | "linux-x64"
  | "linux-arm64"
  | "windows-x64";

const TARGETS: readonly Target[] = [
  "darwin-arm64",
  "darwin-x64",
  "linux-x64",
  "linux-arm64",
  "windows-x64",
];

const REPO_ROOT = resolve(import.meta.dirname, "..");
const DIST = join(REPO_ROOT, "dist");
const CLI_ENTRY = join(REPO_ROOT, "packages", "cli", "src", "index.ts");
const LIBS_DIR = join(REPO_ROOT, "packages", "core", "src", "embeddings", "libs");
const ACTIVE_RUNTIME_DIR = join(LIBS_DIR, "active");
const ACTIVE_RUNTIME = join(ACTIVE_RUNTIME_DIR, "runtime");

function runtimeSource(target: Target): string | null {
  switch (target) {
    case "darwin-arm64":
      return join(LIBS_DIR, "darwin-arm64", "libonnxruntime.1.21.0.dylib");
    case "darwin-x64":
      return join(LIBS_DIR, "darwin-x64", "libonnxruntime.1.21.0.dylib");
    case "linux-x64":
      return join(LIBS_DIR, "linux-x64", "libonnxruntime.so.1.21.0");
    case "linux-arm64":
      return join(LIBS_DIR, "linux-arm64", "libonnxruntime.so.1.21.0");
    case "windows-x64":
      // Windows ships without onnxruntime. The embedder gracefully reports
      // semantic_available=false and search falls back to BM25.
      return null;
  }
}

function buildTarget(target: Target): { artifact: string; size: number } {
  const isWindows = target.startsWith("windows-");

  // Stage the right per-target dylib at `libs/active/runtime` so the embedder's
  // `with { type: "file" }` import picks it up. For windows, we stage a tiny
  // placeholder so the import resolves; embedder.ts detects + falls back.
  mkdirSync(ACTIVE_RUNTIME_DIR, { recursive: true });
  const src = runtimeSource(target);
  if (src) {
    if (!existsSync(src)) {
      throw new Error(
        `${target}: missing ${src}. Drop the dylib in libs/${target}/ first.`,
      );
    }
    copyFileSync(src, ACTIVE_RUNTIME);
  } else {
    // Placeholder bytes: the embedder probes for this and short-circuits.
    writeFileSync(ACTIVE_RUNTIME, Buffer.from("TENSOR_MCP_NO_RUNTIME"));
  }

  const ext = isWindows ? ".exe" : "";
  const artifact = join(DIST, `tensor-mcp-${target}${ext}`);
  mkdirSync(DIST, { recursive: true });

  process.stderr.write(
    `Building tensor-mcp-${target} (runtime: ${src ? "shipped" : "none — BM25 only"})...\n`,
  );

  const result = spawnSync(
    "bun",
    [
      "build",
      CLI_ENTRY,
      "--compile",
      `--target=bun-${target}`,
      "--outfile",
      artifact,
    ],
    { stdio: "inherit", cwd: REPO_ROOT },
  );
  if (result.status !== 0) {
    throw new Error(`bun build failed for ${target} (exit ${result.status})`);
  }

  const size = statSync(artifact).size;
  process.stderr.write(`  → ${artifact} (${formatSize(size)})\n`);
  return { artifact, size };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function resolveHostTarget(): Target | null {
  const p = hostPlatform();
  const a = hostArch();
  if (p === "darwin" && a === "arm64") return "darwin-arm64";
  if (p === "darwin" && a === "x64") return "darwin-x64";
  if (p === "linux" && a === "x64") return "linux-x64";
  if (p === "linux" && a === "arm64") return "linux-arm64";
  if (p === "win32" && a === "x64") return "windows-x64";
  return null;
}

function parseArgs(): Target[] {
  const args = process.argv.slice(2);
  if (args.includes("--all")) return [...TARGETS];

  const targetArg = args.find((a) => a.startsWith("--target="));
  if (targetArg) {
    const t = targetArg.slice("--target=".length) as Target;
    if (!TARGETS.includes(t)) {
      throw new Error(
        `unknown --target=${t}. Supported: ${TARGETS.join(", ")}`,
      );
    }
    return [t];
  }

  const host = resolveHostTarget();
  if (!host) {
    throw new Error(
      `Unsupported host (${hostPlatform()}-${hostArch()}). Pass --target=<…> or --all.`,
    );
  }
  return [host];
}

function sha256(path: string): string {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

function emitChecksums(artifacts: string[]): void {
  const lines: string[] = [];
  for (const a of artifacts) {
    lines.push(`${sha256(a)}  ${a.split("/").pop() ?? a}`);
  }
  writeFileSync(join(DIST, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

function symlinkHostBinary(builtTargets: Target[]): void {
  const host = resolveHostTarget();
  if (!host || !builtTargets.includes(host)) return;
  const hostPath = join(DIST, `tensor-mcp-${host}`);
  if (!existsSync(hostPath)) return;
  const symlink = join(DIST, "tensor-mcp");
  rmSync(symlink, { force: true });
  // Relative symlink so the dist/ dir is portable across hosts.
  const rel = `tensor-mcp-${host}`;
  spawnSync("ln", ["-s", rel, symlink], { stdio: "ignore" });
}

function main(): void {
  const targets = parseArgs();
  const artifacts: string[] = [];
  for (const t of targets) {
    const { artifact } = buildTarget(t);
    artifacts.push(artifact);
  }
  emitChecksums(artifacts);
  symlinkHostBinary(targets);

  process.stderr.write(`\nBuilt ${artifacts.length} artifact(s):\n`);
  for (const a of artifacts) {
    const checksum = sha256(a).slice(0, 12);
    process.stderr.write(`  ${a}  (sha256:${checksum})\n`);
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`scripts/build.ts: ${(err as Error).message}\n`);
  process.exit(1);
}

// `readdirSync` is held in case future logic needs to walk libs/.
void readdirSync;
