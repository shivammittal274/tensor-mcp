import {
  BM25Search,
  Catalog,
  ConnectionsStore,
  searchTools,
} from "@tensor-mcp/core";

export async function searchCmd(
  query: string,
  opts: { topK?: number; services?: string },
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

    if (result.primary_tools.length === 0) {
      process.stdout.write("No matching tools.\n");
      return 0;
    }

    for (const t of result.primary_tools) {
      const status = t.connection_status === "active" ? "✓" : "✗";
      process.stdout.write(
        `${status} ${t.service.padEnd(12)} ${t.tool.padEnd(40)} ${t.score.toFixed(3)}\n`,
      );
      if (t.description)
        process.stdout.write(`    ${t.description.slice(0, 80)}\n`);
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
