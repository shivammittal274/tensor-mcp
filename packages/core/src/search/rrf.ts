/**
 * Reciprocal Rank Fusion — combine N ranked lists into one.
 *
 * For each item, score = Σ 1/(k + rank_i) across all rankers where it
 * appears. Default k=60 per Cormack et al. — robust to noisy individual
 * rankers, no per-ranker score calibration needed (BM25 scores and cosine
 * similarities are on totally different scales).
 *
 * Reference: https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
 */

export interface RankedItem<T> {
  /** Unique stable id used for fusion (e.g. "linear::save_issue"). */
  id: string;
  /** Item payload. */
  item: T;
  /** Position in this list, zero-indexed (0 = top hit). */
  rank: number;
}

export interface FusionResult<T> {
  id: string;
  item: T;
  score: number;
  /** Per-list ranks for debugging: { ranker_name: rank }. */
  contributions: Record<string, number>;
}

const DEFAULT_K = 60;

/**
 * Fuse named ranked lists. The top of each list contributes more weight;
 * items appearing in multiple lists are rewarded by summed contribution.
 *
 * Caller supplies a stable id per item (so the same tool from two rankers
 * collapses into one fused result).
 */
export function reciprocalRankFusion<T>(
  lists: Record<string, Array<RankedItem<T>>>,
  opts: { k?: number; topK?: number } = {},
): FusionResult<T>[] {
  const k = opts.k ?? DEFAULT_K;
  const topK = opts.topK ?? 8;

  const aggregate = new Map<string, FusionResult<T>>();
  for (const [name, list] of Object.entries(lists)) {
    for (const entry of list) {
      const existing = aggregate.get(entry.id);
      const contribution = 1 / (k + entry.rank);
      if (existing) {
        existing.score += contribution;
        existing.contributions[name] = entry.rank;
      } else {
        aggregate.set(entry.id, {
          id: entry.id,
          item: entry.item,
          score: contribution,
          contributions: { [name]: entry.rank },
        });
      }
    }
  }

  return Array.from(aggregate.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
