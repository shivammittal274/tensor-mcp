#!/usr/bin/env bun
/*
 * scripts/sync-pipedream.ts — sync local services with their upstream
 * Pipedream components.
 *
 * Convention: each service folder under `packages/core/src/services/`
 * has the same name as the corresponding Pipedream component. This
 * script clones (sparse) Pipedream's monorepo, sparse-checkouts the
 * requested components, and refreshes our local copy verbatim:
 *
 *   • Copies every .mjs file from `components/<id>/` into
 *     `services/<id>/` (preserving the `actions/`, `common/`,
 *     `<id>.app.mjs` layout).
 *
 *   • Deletes the npm packaging cruft (`package.json`, `README.md`,
 *     `sources/`) — `package.json` would otherwise hijack Bun's
 *     module resolution (it has a `main:` field pointing at the
 *     Pipedream app.mjs which short-circuits `import x from "./<id>"`),
 *     and `sources/` is Pipedream's webhook-trigger code we don't expose.
 *
 *   • Regenerates `index.mjs` + `index.d.mts` automatically by walking
 *     the action subdirs and emitting `import …` / `export const actions`.
 *
 *   • Preserves the handwritten `index.ts` (the defineService entry).
 *
 * Usage:
 *   bun run scripts/sync-pipedream.ts <component-id> [<component-id>…]
 *   bun run scripts/sync-pipedream.ts --all
 *
 * The first invocation clones into /tmp/pipedream-lift (~30s, ~50 MB
 * sparse). Subsequent runs reuse the clone and just sparse-add any new
 * components + git pull.
 *
 * After the sync, the script prints:
 *   • Per-service action counts (new total vs previous).
 *   • Aggregate npm dependencies discovered by scanning `import` lines
 *     in the lifted code. Compare against `packages/core/package.json`
 *     and `bun add` whatever's missing.
 *
 * It deliberately doesn't touch `package.json` or run `bun install` —
 * that stays human-driven so you spot when a new dep would balloon the
 * binary or pull a sketchy transitive.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, resolve } from "node:path";

// Node built-ins shouldn't surface in the "deps to add" list. Both bare
// names (`fs`, `crypto`) and the `node:` prefix variant are filtered.
const NODE_BUILTINS = new Set(builtinModules);

const REPO_ROOT = resolve(import.meta.dirname, "..");
const SERVICES_DIR = join(REPO_ROOT, "packages/core/src/services");
const CLONE_DIR = "/tmp/pipedream-lift";
const PIPEDREAM_REPO = "https://github.com/PipedreamHQ/pipedream.git";

// Every Pipedream-based service we maintain. Folder name == upstream
// component name. New service? Add it here + drop an `index.ts` under
// services/<id>/ with `defineService({...})`.
const ALL_COMPONENTS = [
  "slack_v2",
  "github",
  "anthropic",
  "brave_search_api",
  "tavily",
  "firecrawl",
  "gmail",
  "google_calendar",
  "google_drive",
  "google_docs",
  "google_sheets",
  "google_meet",
  "youtube_data_api",
  "discord_bot",
  "telegram_bot_api",
  "stripe",
  "exa",
  "gitlab",
  "posthog",
  "supabase",
];

function sh(cmd: string, cwd?: string): void {
  const r = spawnSync("sh", ["-c", cmd], {
    stdio: "inherit",
    cwd: cwd ?? process.cwd(),
  });
  if (r.status !== 0) {
    throw new Error(`command failed (exit ${r.status}): ${cmd}`);
  }
}

function ensureClone(components: readonly string[]): void {
  if (!existsSync(CLONE_DIR)) {
    console.log(`→ cloning Pipedream sparse into ${CLONE_DIR}`);
    sh(
      `git clone --depth=1 --filter=blob:none --sparse ${PIPEDREAM_REPO} ${CLONE_DIR}`,
    );
  }
  const paths = components.map((c) => `components/${c}`).join(" ");
  sh(`git sparse-checkout add ${paths}`, CLONE_DIR);
  // Pull to get latest master state for the requested paths.
  sh("git pull --ff-only origin master", CLONE_DIR);
}

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

interface SyncResult {
  component: string;
  prevActions: number;
  newActions: number;
  deps: Set<string>;
}

function syncOne(component: string): SyncResult {
  const src = join(CLONE_DIR, "components", component);
  const dst = join(SERVICES_DIR, component);

  if (!existsSync(src)) {
    throw new Error(`upstream component not found: ${component}`);
  }

  // Track prior action count so the summary can show the delta.
  const prevActionsDir = join(dst, "actions");
  const prevActions = existsSync(prevActionsDir)
    ? readdirSync(prevActionsDir).filter(
        (d) =>
          d !== "common" && statSync(join(prevActionsDir, d)).isDirectory(),
      ).length
    : 0;

  // Preserve our handwritten index.ts (the defineService entry).
  const preservedIndexTs = existsSync(join(dst, "index.ts"))
    ? readFileSync(join(dst, "index.ts"), "utf8")
    : null;

  // Wipe Pipedream-controlled files but keep index.ts.
  if (existsSync(dst)) {
    for (const f of readdirSync(dst)) {
      if (f === "index.ts") continue;
      rmSync(join(dst, f), { recursive: true, force: true });
    }
  } else {
    mkdirSync(dst, { recursive: true });
  }

  // Copy the entire component dir verbatim from upstream.
  cpSync(src, dst, { recursive: true });

  // Strip cruft. package.json would hijack Bun's `./<id>` resolution;
  // sources/ is Pipedream's webhook-trigger code we deliberately don't
  // expose; README.md is harmless but adds noise.
  rmSync(join(dst, "package.json"), { force: true });
  rmSync(join(dst, "README.md"), { force: true });
  rmSync(join(dst, "sources"), { recursive: true, force: true });

  // Restore handwritten index.ts.
  if (preservedIndexTs != null) {
    writeFileSync(join(dst, "index.ts"), preservedIndexTs);
  }

  // Locate the .app.mjs — Pipedream's convention is one per component.
  const appFile = readdirSync(dst).find((f) => f.endsWith(".app.mjs"));
  if (!appFile) {
    throw new Error(`no <name>.app.mjs in ${component}`);
  }

  // Enumerate actions. Each subdir of actions/ (except `common`) should
  // contain a `<dir>.mjs` file — the action entry point.
  const actionsDir = join(dst, "actions");
  const actionDirs = existsSync(actionsDir)
    ? readdirSync(actionsDir)
        .filter((d) => d !== "common")
        .filter((d) => {
          const p = join(actionsDir, d);
          return statSync(p).isDirectory() && existsSync(join(p, `${d}.mjs`));
        })
        .sort()
    : [];

  const entries = actionDirs.map((d) => ({ kebab: d, camel: kebabToCamel(d) }));

  // Generate index.mjs barrel.
  const indexMjs = [
    `import app from "./${appFile}";`,
    ...entries.map(
      (e) => `import ${e.camel} from "./actions/${e.kebab}/${e.kebab}.mjs";`,
    ),
    "",
    `export { app${entries.length > 0 ? ", " + entries.map((e) => e.camel).join(", ") : ""} };`,
    "export const actions = [",
    ...entries.map((e) => `  ${e.camel},`),
    "];",
    "",
  ].join("\n");
  writeFileSync(join(dst, "index.mjs"), indexMjs);

  // Generate index.d.mts type declarations.
  const indexDts = [
    `import type {`,
    `  PipedreamActionModule,`,
    `  PipedreamAppModule,`,
    `} from "../../transports/pipedream/types";`,
    "",
    `export const app: PipedreamAppModule;`,
    ...entries.map(
      (e) => `export const ${e.camel}: PipedreamActionModule;`,
    ),
    `export const actions: PipedreamActionModule[];`,
    "",
  ].join("\n");
  writeFileSync(join(dst, "index.d.mts"), indexDts);

  // Scan imports across all lifted .mjs files to surface npm deps the
  // user should add to packages/core/package.json.
  const deps = new Set<string>();
  walkMjs(dst, (filePath) => {
    const text = readFileSync(filePath, "utf8");
    for (const m of text.matchAll(/from\s+"([^"]+)"/g)) {
      const spec = m[1];
      if (spec.startsWith(".") || spec.startsWith("/")) continue;
      // `${…}` matches when a template-literal string happens to contain
      // the substring `from "…"` — surface only real package specifiers.
      if (spec.includes("${")) continue;
      if (spec.startsWith("node:")) continue;
      const pkg = spec.startsWith("@")
        ? spec.split("/").slice(0, 2).join("/")
        : spec.split("/")[0];
      if (NODE_BUILTINS.has(pkg)) continue;
      deps.add(pkg);
    }
  });

  return { component, prevActions, newActions: entries.length, deps };
}

function walkMjs(dir: string, visit: (path: string) => void): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walkMjs(p, visit);
    else if (entry.isFile() && entry.name.endsWith(".mjs")) visit(p);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  let components: readonly string[];
  if (args.includes("--all")) {
    components = ALL_COMPONENTS;
  } else if (args.length === 0) {
    console.error(
      "Usage: bun run scripts/sync-pipedream.ts <component>... | --all",
    );
    console.error("Known components:");
    for (const c of ALL_COMPONENTS) console.error(`  ${c}`);
    process.exit(1);
    return;
  } else {
    components = args;
  }

  console.log(`→ syncing ${components.length} components from Pipedream`);
  ensureClone(components);

  const results: SyncResult[] = [];
  for (const c of components) {
    process.stdout.write(`→ ${c}: `);
    try {
      const r = syncOne(c);
      results.push(r);
      const delta = r.newActions - r.prevActions;
      const sign = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0";
      console.log(`${r.newActions} actions (${sign} from prior)`);
    } catch (err) {
      console.log(`FAILED — ${(err as Error).message}`);
    }
  }

  // Aggregate deps surfaced across all synced services.
  const aggregateDeps = new Set<string>();
  for (const r of results) for (const d of r.deps) aggregateDeps.add(d);

  console.log("");
  console.log("─── Aggregate npm deps surfaced ───");
  for (const d of [...aggregateDeps].sort()) console.log(`  ${d}`);
  console.log("");
  console.log("Compare against packages/core/package.json. Add any missing");
  console.log("via `bun add <pkg>` and re-run smoke tests before committing.");
}

main();
