import type { Catalog } from "../catalog/catalog";
import { getEmbedder } from "../embeddings/embedder";
import { ensureEmbeddings } from "../embeddings/ensure";

/**
 * Eagerly compute + persist embeddings for any catalog row missing one.
 * Scoped to a single app (`scope.app`) on connect — full-catalog scope
 * is for one-off backfills (CLI debug). Best-effort: if embeddings aren't
 * available on this host (Windows, dylib missing), return without
 * raising. The downstream search call will fall back to BM25-only.
 *
 * Lives next to the `connect` meta-tool because that's the one caller
 * today; not part of the package's public surface.
 */
export async function backfillEmbeddings(
  catalog: Catalog,
  scope?: { app?: string },
): Promise<void> {
  const probe = await ensureEmbeddings();
  if (!probe.available) return;

  const rows = scope?.app
    ? await catalog.listByService(scope.app)
    : await catalog.listAll();
  const missing = rows.filter((r) => r.embedding == null);
  if (missing.length === 0) return;

  let embedder: Awaited<ReturnType<typeof getEmbedder>>;
  try {
    embedder = await getEmbedder();
  } catch {
    return;
  }

  const texts = missing.map((r) => `${r.toolName}: ${r.description}`);
  const vectors = await embedder.embed(texts);
  await catalog.updateEmbeddings(
    missing.map((r, i) => ({
      service: r.service,
      toolName: r.toolName,
      embedding: vectors[i],
    })),
  );
}
