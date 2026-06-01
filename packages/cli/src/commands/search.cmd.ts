import { bootstrap, search } from "@tensor-mcp/core";
import { emitErr, emitOk } from "../utils/json";

export interface SearchCmdOpts {
  topK?: number | string;
  threshold?: number | string;
  apps?: string;
}

/**
 * `tensor-mcp search "<query>"` — single search entry, pairs with the MCP
 * `search_tools` tool. Scope is always currently-connected apps (the
 * catalog only carries connected services' tools — disconnect drops them).
 *
 * All output is JSON: the same shape the MCP tool returns. The algorithm
 * is RRF over BM25 + embeddings, with automatic fallback to BM25 when
 * embeddings aren't available.
 */
export async function searchCmd(
  query: string,
  opts: SearchCmdOpts,
): Promise<number> {
  const catalog = await bootstrap();
  try {
    const result = await search(catalog, {
      query,
      top_k: opts.topK == null ? undefined : Number(opts.topK),
      threshold:
        opts.threshold == null ? undefined : Number(opts.threshold),
      apps: opts.apps ? opts.apps.split(",").map((s) => s.trim()) : undefined,
    });
    return emitOk(result);
  } catch (err) {
    return emitErr((err as Error).message);
  } finally {
    catalog.close();
  }
}
