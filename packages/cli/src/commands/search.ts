import {
  BM25Search,
  Catalog,
  ConnectionsStore,
  type ParamSummary,
  searchTools,
} from "@tensor-mcp/core";

export interface SearchCmdOpts {
  topK?: number;
  services?: string;
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
    const searchIndex = new BM25Search(
      all.map((t) => ({
        service: t.service,
        toolName: t.toolName,
        description: t.description,
      })),
    );

    const result = await searchTools(
      {
        query,
        topK: opts.topK ? Number(opts.topK) : 5,
        services: opts.services ? opts.services.split(",") : undefined,
      },
      {
        searchIndex,
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

    for (const t of result.primary_tools) {
      const status = t.connection_status === "active" ? "✓" : "✗";
      process.stdout.write(
        `${status} ${t.service.padEnd(12)} ${t.tool.padEnd(40)} ${t.score.toFixed(3)}\n`,
      );
      if (t.description) {
        // Show first paragraph in full — descriptions often disambiguate
        // overloaded verbs (e.g. Linear's `save_issue` = create OR update).
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
        // Optional is one line per param when there are few, compact list otherwise.
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
