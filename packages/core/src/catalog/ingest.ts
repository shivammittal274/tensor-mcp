import type { ActivepiecesConfig } from "../defineService";
import { actionToJsonSchema } from "../services/adapt/activepieces/propsToJsonSchema";
import { listToolsForPiece } from "../services/adapt/activepieces/runAction";
import { defaultAuthHeaders, type RemoteMcpConfig } from "../transports/remote";
import type { TokenBundle } from "../stores/types";
import { connectMcpClient } from "../transports/stdio";
import { spawnService } from "../transports/stdio-spawn";
import type { SpawnConfig } from "../transports/types";
import type { Catalog, CatalogTool } from "./catalog";

export interface IngestServiceConfig {
  service: string;
  /** Local-subprocess execution. */
  spawn?: SpawnConfig;
  /** Hosted-MCP execution. */
  remote?: RemoteMcpConfig;
  /** Activepieces in-process dispatch. */
  activepieces?: ActivepiecesConfig;
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

  if (config.activepieces) {
    const actions = listToolsForPiece(config.activepieces.piece);
    const now = Date.now();
    const rows: CatalogTool[] = actions.map((a) => {
      const inputSchema = actionToJsonSchema(a);
      return {
        service: config.service,
        toolName: a.name,
        description: a.description,
        inputSchema,
        versionHash: versionHash(config.service, a.name, inputSchema),
        indexedAt: now,
      };
    });
    await catalog.upsertService(config.service, rows);
    return rows.length;
  }

  if (config.remote) {
    const headers = (config.remote.authHeaders ?? defaultAuthHeaders)(token);
    const client = await connectMcpClient(config.remote.mcpUrl, { headers });
    try {
      return await persistTools(catalog, config.service, client);
    } finally {
      await client.close();
    }
  }

  if (!config.spawn) {
    throw new Error(
      `ingestService('${config.service}'): exactly one of 'spawn' / 'remote' / 'activepieces' must be set`,
    );
  }

  const handle = await spawnService(config.service, config.spawn, {
    token,
    readinessTimeoutMs: config.readinessTimeoutMs,
    tensorMcpRoot: config.tensorMcpRoot,
  });
  try {
    const client = await connectMcpClient(handle.mcpUrl);
    try {
      return await persistTools(catalog, config.service, client);
    } finally {
      await client.close();
    }
  } finally {
    await handle.kill();
  }
}

async function persistTools(
  catalog: Catalog,
  service: string,
  client: {
    listTools: () => Promise<
      Array<{ name: string; description?: string; inputSchema: unknown }>
    >;
  },
): Promise<number> {
  const tools = await client.listTools();
  const now = Date.now();
  const rows: CatalogTool[] = tools.map((t) => ({
    service,
    toolName: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema,
    versionHash: versionHash(service, t.name, t.inputSchema),
    indexedAt: now,
  }));
  await catalog.upsertService(service, rows);
  return rows.length;
}
