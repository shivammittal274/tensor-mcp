import {
  BM25Search,
  Catalog,
  ConnectionsStore,
  getEmbedder,
  type ParamSummary,
  type Ranker,
  searchTools,
  SemanticSearch,
  type ToolIndexable,
} from "@tensor-mcp/core";

export interface SearchCmdOpts {
  topK?: number;
  services?: string;
  ranker?: Ranker;
  /** Dump the full JSON input_schema under each hit (for debugging). */
  schema?: boolean;
  /** Print as JSON instead of the human table. */
  json?: boolean;
}

export async function searchCmd(
  query: string,
  opts: SearchCmdOpts,
): Promise<number> {
  const catalog = new Catalog({});
  await catalog.open();
  const connections = new ConnectionsStore({});

  try {
    const all = await catalog.listAll();
    if (all.length === 0) {
      process.stderr.write(
        "Catalog empty. Run 'tensor-mcp connect <service>' first to ingest tools.\n",
      );
      return 1;
    }

    // Build the keyword (BM25+) index — always available.
    const indexableTools: ToolIndexable[] = all.map((t) => ({
      service: t.service,
      toolName: t.toolName,
      description: t.description,
    }));
    const searchIndex = new BM25Search(indexableTools);

    // Build the semantic index if the user wants it (default ranker = "rrf").
    // Cold path: lazy-backfill embeddings for tools indexed before semantic
    // search shipped — `connect` going forward also computes them.
    const wantsSemantic = opts.ranker !== "bm25";
    let semanticIndex: SemanticSearch<ToolIndexable> | undefined;
    let embedQuery: ((q: string) => Promise<Float32Array>) | undefined;

    if (wantsSemantic) {
      const missing = all.filter((t) => !t.embedding);
      if (missing.length > 0) {
        process.stderr.write(
          `Embedding ${missing.length} tool${missing.length === 1 ? "" : "s"} (one-time)...\n`,
        );
        const embedder = await getEmbedder();
        const texts = missing.map((t) => `${t.toolName}: ${t.description}`);
        const vectors = await embedder.embed(texts);
        await catalog.updateEmbeddings(
          missing.map((t, i) => ({
            service: t.service,
            toolName: t.toolName,
            embedding: vectors[i],
          })),
        );
        for (let i = 0; i < missing.length; i++) missing[i].embedding = vectors[i];
      }

      const embeddings = all.map((t) => t.embedding!);
      semanticIndex = new SemanticSearch(indexableTools, embeddings);
      const embedder = await getEmbedder();
      embedQuery = async (q) => (await embedder.embed([q]))[0];
    }

    const result = await searchTools(
      {
        query,
        topK: opts.topK ? Number(opts.topK) : 8,
        services: opts.services ? opts.services.split(",") : undefined,
        ranker: opts.ranker,
      },
      {
        searchIndex,
        semanticIndex,
        embedQuery,
        catalog,
        isConnected: async (s) =>
          (await connections.get(`${s}:default`)) !== null,
      },
    );

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    if (result.primary_tools.length === 0) {
      process.stdout.write("No matching tools.\n");
      return 0;
    }

    process.stdout.write(`(ranker: ${result.ranker_used})\n`);
    for (const t of result.primary_tools) {
      const status = t.connection_status === "active" ? "✓" : "✗";
      process.stdout.write(
        `${status} ${t.service.padEnd(12)} ${t.tool.padEnd(40)} ${t.score.toFixed(3)}\n`,
      );
      if (t.description) {
        const para = t.description.split(/\n\s*\n/)[0] ?? "";
        process.stdout.write(`    ${para.trim().slice(0, 320)}\n`);
      }
      const req = t.required_params ?? [];
      const opt = t.optional_params ?? [];
      if (req.length > 0) {
        process.stdout.write(`    Required:\n`);
        for (const p of req) {
          process.stdout.write(`      • ${formatParam(p)}\n`);
        }
      }
      if (opt.length > 0) {
        if (opt.length <= 4) {
          process.stdout.write(`    Optional:\n`);
          for (const p of opt) {
            process.stdout.write(`      • ${formatParam(p)}\n`);
          }
        } else {
          process.stdout.write(`    Optional: ${formatParamsCompact(opt)}\n`);
        }
      }
      if (opts.schema && t.input_schema) {
        const json = JSON.stringify(t.input_schema, null, 2);
        process.stdout.write(`    Schema:\n${indent(json, "      ")}\n`);
      }
    }
    if (result.missing_connections.length > 0) {
      process.stdout.write(
        `\nMissing connections: ${result.missing_connections.map((m) => m.service).join(", ")}\n`,
      );
    }
    return 0;
  } finally {
    catalog.close();
  }
}

function formatParam(p: ParamSummary): string {
  const enumPart = p.enum ? `=${p.enum.join("|")}` : "";
  const head = `${p.name} (${p.type}${enumPart})`;
  if (!p.description) return head;
  const desc = p.description.replace(/\s+/g, " ").trim();
  return `${head} — ${desc}`;
}

function formatParamsCompact(params: ParamSummary[]): string {
  return params
    .map((p) => {
      const enumPart = p.enum ? `=${p.enum.join("|")}` : "";
      return `${p.name} (${p.type}${enumPart})`;
    })
    .join(", ");
}

function indent(s: string, prefix: string): string {
  return s
    .split("\n")
    .map((l) => `${prefix}${l}`)
    .join("\n");
}
