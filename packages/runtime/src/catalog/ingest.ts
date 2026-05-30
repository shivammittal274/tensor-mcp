import { connectMcpClient } from "../subprocess/mcp_client";
import { type ServiceConfig, spawnService } from "../subprocess/spawner";
import { type CatalogTool, Catalog } from "./catalog";

export type IngestServiceConfig = Omit<ServiceConfig, "authData"> & {
  authData?: string;
};

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
  serviceConfig: IngestServiceConfig,
): Promise<number> {
  const authData =
    serviceConfig.authData ??
    Buffer.from(JSON.stringify({ access_token: "ingest_only" })).toString(
      "base64",
    );

  const handle = await spawnService({ ...serviceConfig, authData });
  try {
    const client = await connectMcpClient(handle.mcpUrl);
    try {
      const tools = await client.listTools();
      const now = Date.now();
      const rows: CatalogTool[] = tools.map((t) => ({
        service: serviceConfig.service,
        toolName: t.name,
        description: t.description ?? "",
        inputSchema: t.inputSchema,
        versionHash: versionHash(
          serviceConfig.service,
          t.name,
          t.inputSchema,
        ),
        indexedAt: now,
      }));
      await catalog.upsertService(serviceConfig.service, rows);
      return rows.length;
    } finally {
      await client.close();
    }
  } finally {
    await handle.kill();
  }
}
