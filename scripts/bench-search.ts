#!/usr/bin/env bun
/**
 * bench-search.ts — old-vs-new indexing diff over the live catalog.
 *
 * "Old" indexing  = BM25 over {service, toolName, description}, plus a
 *                   semantic index built from `"${toolName}: ${description}"`.
 * "New" indexing  = BM25 over {service, toolName, description, paramText},
 *                   semantic index from
 *                   `"${toolName}\n${description}\n${paramText}"`.
 *
 * Both modes RRF-fuse BM25 + semantic — same scorer the production search
 * uses. We hold every knob constant except the indexed text so the diff is
 * attributable to schema-aware indexing alone.
 *
 * Catalog path: ~/.tensor-mcp/catalog.sqlite (override via TENSOR_MCP_CATALOG).
 * Reads only — never mutates stored embeddings; the bench embeds fresh
 * vectors at run time in both modes.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { Catalog } from "../packages/core/src/catalog/catalog";
import { getEmbedder } from "../packages/core/src/embeddings/embedder";
import { ensureEmbeddings } from "../packages/core/src/embeddings/ensure";
import { BM25Search, type ToolIndexable } from "../packages/core/src/search/bm25";
import { reciprocalRankFusion } from "../packages/core/src/search/rrf";
import { buildParamText } from "../packages/core/src/search/schema-summary";
import { SemanticSearch } from "../packages/core/src/search/semantic";

const TOP_K = 3;
const OVERFETCH = 12;

const QUERIES = [
  "create an issue",
  "create issue with assignees and labels",
  "send a message",
  "send message to a slack channel",
  "list channels",
  "list teams",
  "search code",
  "schedule a meeting",
  "summarize this document",
  "list pull requests",
  "create a pull request with reviewers",
  "find a tool to read csv",
  "post to discord",
  "look up someone in hubspot",
  "create google calendar event",
];

interface BenchHit {
  service: string;
  toolName: string;
  score: number;
  bm25Rank?: number;
  semRank?: number;
}

async function main() {
  const catalogPath =
    process.env.TENSOR_MCP_CATALOG ??
    join(homedir(), ".tensor-mcp", "catalog.sqlite");

  const catalog = new Catalog({ path: catalogPath });
  await catalog.open();
  const rows = await catalog.listAll();
  catalog.close();

  if (rows.length === 0) {
    console.error(`No tools in catalog at ${catalogPath}. Connect some apps first.`);
    process.exit(1);
  }

  const probe = await ensureEmbeddings();
  if (!probe.available) {
    console.error(`Embeddings unavailable (${probe.reason ?? "?"}). Bench needs them.`);
    process.exit(1);
  }
  const embedder = await getEmbedder();

  const oldIndexable: ToolIndexable[] = rows.map((r) => ({
    service: r.service,
    toolName: r.toolName,
    description: r.description,
    paramText: "",
  }));
  const newIndexable: ToolIndexable[] = rows.map((r) => ({
    service: r.service,
    toolName: r.toolName,
    description: r.description,
    paramText: buildParamText(r.inputSchema ?? {}),
  }));

  const oldTexts = rows.map((r) => `${r.toolName}: ${r.description}`);
  const newTexts = rows.map(
    (r) =>
      `${r.toolName}\n${r.description}\n${buildParamText(r.inputSchema ?? {})}`,
  );

  process.stderr.write(`Embedding ${rows.length} tools (old text)…\n`);
  const oldVectors = await embedder.embed(oldTexts);
  process.stderr.write(`Embedding ${rows.length} tools (new text)…\n`);
  const newVectors = await embedder.embed(newTexts);

  const oldBm25 = new BM25Search(oldIndexable);
  const newBm25 = new BM25Search(newIndexable);
  const oldSem = new SemanticSearch(oldIndexable, oldVectors);
  const newSem = new SemanticSearch(newIndexable, newVectors);

  const lines: string[] = [];
  lines.push(`# Search bench — old vs new indexing\n`);
  lines.push(`Catalog: \`${catalogPath}\``);
  lines.push(
    `Rows: **${rows.length}** across ${
      new Set(rows.map((r) => r.service)).size
    } apps: ${[...new Set(rows.map((r) => r.service))].sort().join(", ")}\n`,
  );
  lines.push(
    `Each query is RRF-fused BM25 + semantic (k=60). top_k=${TOP_K}, overfetch=${OVERFETCH}. threshold=0.`,
  );
  lines.push(`Rank columns: \`b=<bm25Rank> s=<semRank>\` (0-indexed, "—" = miss).\n`);

  for (const query of QUERIES) {
    process.stderr.write(`> ${query}\n`);
    const qOld = await embedder.embed([query]);
    const qNew = await embedder.embed([query]);
    const oldHits = runFused(oldBm25, oldSem, qOld[0], query);
    const newHits = runFused(newBm25, newSem, qNew[0], query);

    lines.push(`## \`${query}\``);
    lines.push("");
    lines.push("| # | OLD (svc · tool · b/s) | score | NEW (svc · tool · b/s) | score |");
    lines.push("|---|---|---|---|---|");
    for (let i = 0; i < TOP_K; i++) {
      const o = oldHits[i];
      const n = newHits[i];
      lines.push(
        `| ${i + 1} | ${fmtHit(o)} | ${fmtScore(o)} | ${fmtHit(n)} | ${fmtScore(n)} |`,
      );
    }
    lines.push("");
  }

  process.stdout.write(lines.join("\n"));
  process.stdout.write("\n");
}

function runFused(
  bm25: BM25Search<ToolIndexable>,
  sem: SemanticSearch<ToolIndexable>,
  qv: Float32Array,
  query: string,
): BenchHit[] {
  const bm25Hits = bm25.search(query, OVERFETCH);
  const semHits = sem.search(qv, OVERFETCH);
  const id = (t: ToolIndexable) => `${t.service}::${t.toolName}`;
  const fused = reciprocalRankFusion(
    {
      bm25: bm25Hits.map((h, i) => ({ id: id(h.tool), item: h.tool, rank: i })),
      semantic: semHits.map((h, i) => ({
        id: id(h.tool),
        item: h.tool,
        rank: i,
      })),
    },
    { topK: OVERFETCH },
  );
  return fused.slice(0, TOP_K).map((r) => ({
    service: r.item.service,
    toolName: r.item.toolName,
    score: r.score,
    bm25Rank: r.contributions.bm25,
    semRank: r.contributions.semantic,
  }));
}

function fmtHit(h: BenchHit | undefined): string {
  if (!h) return "—";
  const b = h.bm25Rank === undefined ? "—" : String(h.bm25Rank);
  const s = h.semRank === undefined ? "—" : String(h.semRank);
  return `\`${h.service}\` · \`${h.toolName}\` · b=${b} s=${s}`;
}

function fmtScore(h: BenchHit | undefined): string {
  if (!h) return "";
  return h.score.toFixed(4);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
