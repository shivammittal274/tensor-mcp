/**
 * Dense-vector search over pre-embedded tools. Mirrors `BM25Search`'s API so
 * `searchTools` can fuse them via RRF without caring which ranker is which.
 *
 * Cosine similarity over normalized vectors collapses to a plain dot
 * product — the embedder already L2-normalizes, so we just dot.
 *
 * For ~600 tools × 384-dim vectors = 230 KB of float math per query. ~1ms
 * on M1 — no need for HNSW/ANN at this scale.
 */

import type { ToolIndexable, SearchHit } from "./bm25";

export class SemanticSearch<T extends ToolIndexable> {
  private readonly tools: T[];
  private readonly vectors: Float32Array[];
  private readonly dim: number;

  constructor(tools: T[], vectors: Float32Array[]) {
    if (tools.length !== vectors.length) {
      throw new Error(
        `SemanticSearch: tools (${tools.length}) and vectors (${vectors.length}) length mismatch`,
      );
    }
    this.tools = tools;
    this.vectors = vectors;
    this.dim = vectors[0]?.length ?? 0;
  }

  search(queryVector: Float32Array, topK = 8): SearchHit<T>[] {
    if (this.vectors.length === 0 || queryVector.length === 0) return [];
    if (queryVector.length !== this.dim) {
      throw new Error(
        `SemanticSearch: query dim (${queryVector.length}) != index dim (${this.dim})`,
      );
    }

    const scores: SearchHit<T>[] = [];
    for (let i = 0; i < this.vectors.length; i++) {
      const v = this.vectors[i];
      let dot = 0;
      for (let j = 0; j < v.length; j++) dot += queryVector[j] * v[j];
      if (dot > 0) scores.push({ tool: this.tools[i], score: dot });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }
}
