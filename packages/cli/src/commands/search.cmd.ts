import {
  Catalog,
  connectionIdFor,
  ConnectionsStore,
  search,
} from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

export interface SearchCmdOpts {
  topK?: number | string;
  threshold?: number | string;
  apps?: string;
  includeUnconnected?: boolean;
}

/**
 * `tensor-mcp search "<query>"` — single search entry, pairs with the MCP
 * `search_tools` tool. Default scope is connected apps only (override with
 * `--include-unconnected`).
 *
 * All output is JSON: the same shape the MCP tool returns. No table mode,
 * no `--ranker`, no `--schema` flag — the algorithm is RRF over BM25 +
 * embeddings, automatic fallback to BM25 when embeddings aren't available.
 */
export async function searchCmd(
  query: string,
  opts: SearchCmdOpts,
): Promise<number> {
  const catalog = new Catalog({});
  await catalog.open();
  const connections = new ConnectionsStore({});
  try {
    const result = await search(
      catalog,
      {
        query,
        top_k: opts.topK == null ? undefined : Number(opts.topK),
        threshold:
          opts.threshold == null ? undefined : Number(opts.threshold),
        apps: opts.apps ? opts.apps.split(",").map((s) => s.trim()) : undefined,
        include_unconnected: opts.includeUnconnected === true,
      },
      {
        isConnected: async (app) =>
          (await connections.get(connectionIdFor(app))) !== null,
      },
    );
    return emitOk(result);
  } catch (err) {
    return emitErr((err as Error).message);
  } finally {
    catalog.close();
  }
}
