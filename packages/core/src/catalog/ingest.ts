import { connectMcpClient } from "../subprocess/mcp-client";
import type { Executor } from "../subprocess/types";
import type { TokenBundle } from "../stores/types";
import { type CatalogTool, Catalog } from "./catalog";

export interface IngestServiceConfig {
  service: string;
  executor: Executor;
  token?: TokenBundle;
  readinessTimeoutMs?: number;
  tensorMcpRoot?: string;
}

function versionHash(
  service: string,
  toolName: string,
  inputSchema: unknown,
): string {
  const str = `${service}|${toolName}|${JSON.stringify(inputSchema)}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(str);
  return hasher.digest("hex").slice(0, 16);
}

export async function ingestService(
  catalog: Catalog,
  config: IngestServiceConfig,
): Promise<number> {
  const token: TokenBundle = config.token ?? {
    access_token: "ingest_only_dummy",
  };

  const handle = await config.executor.spawn({
    token,
    readinessTimeoutMs: config.readinessTimeoutMs,
    tensorMcpRoot: config.tensorMcpRoot,
  });
  try {
    const client = await connectMcpClient(handle.mcpUrl);
    try {
      const tools = await client.listTools();
      const now = Date.now();
      const rows: CatalogTool[] = tools.map((t) => ({
        service: config.service,
        toolName: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
        versionHash: versionHash(config.service, t.name, t.inputSchema),
        indexedAt: now,
      }));
      await catalog.upsertService(config.service, rows);
      return rows.length;
    } finally {
      await client.close();
    }
  } finally {
    await handle.kill();
  }
}
