import type { PipedreamServiceConfig } from "../defineService";
import { listPipedreamTools } from "../transports/pipedream";
import {
  connectMcpClient,
  defaultAuthHeaders,
  type RemoteMcpConfig,
} from "../transports/remote";
import type { TokenBundle } from "../stores/types";
import type { Catalog, CatalogTool } from "./catalog";

export interface IngestServiceConfig {
  service: string;
  /** Hosted-MCP execution. Mutually exclusive with `pipedream`. */
  remote?: RemoteMcpConfig;
  /** In-process Pipedream component execution. Mutually exclusive with `remote`. */
  pipedream?: PipedreamServiceConfig;
  /** Required for `remote` (becomes Bearer header). Ignored for `pipedream`. */
  token?: TokenBundle;
}

/**
 * Walk a service's transport, enumerate its tools, persist them to the
 * catalog. Two paths:
 *
 *  - `pipedream`: read action modules in-process (zero IO), generate JSON
 *    schemas from `action.props`, write rows.
 *  - `remote`: connect a Streamable HTTP MCP client with the user's Bearer
 *    token, call `listTools()`, write rows.
 *
 * Idempotent — `catalog.upsertService` clears prior rows for the service.
 */
export async function ingestService(
  catalog: Catalog,
  config: IngestServiceConfig,
): Promise<number> {
  if (config.pipedream) {
    const tools = listPipedreamTools(config.pipedream.actions).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
    return await persistTools(catalog, config.service, async () => tools);
  }

  if (config.remote) {
    const token: TokenBundle = config.token ?? {
      access_token: "ingest_only_dummy",
    };
    const headers = (config.remote.authHeaders ?? defaultAuthHeaders)(token);
    const client = await connectMcpClient(config.remote.mcpUrl, { headers });
    try {
      return await persistTools(catalog, config.service, () =>
        client.listTools(),
      );
    } finally {
      await client.close();
    }
  }

  throw new Error(
    `ingestService('${config.service}'): exactly one of 'remote' or 'pipedream' must be set`,
  );
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

async function persistTools(
  catalog: Catalog,
  service: string,
  listTools: () => Promise<
    Array<{ name: string; description?: string; inputSchema: unknown }>
  >,
): Promise<number> {
  const tools = await listTools();
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
