import BM25 from "okapibm25";

export interface ToolIndexable {
  service: string;
  toolName: string;
  description: string;
}

export interface SearchHit<T extends ToolIndexable> {
  tool: T;
  score: number;
}

export interface BM25SearchOptions {
  k1?: number;
  b?: number;
}

const FIELD_WEIGHTS = {
  service: 30,
  toolName: 30,
  description: 20,
} as const;

function preprocess(text: string): string {
  let s = text.replace(/_/g, " ").replace(/-/g, " ");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/\s+/g, " ").trim();
  return s.toLowerCase();
}

function tokenize(text: string): string[] {
  return preprocess(text).split(/\s+/).filter(Boolean);
}

/**
 * Field-weighted BM25 over a tool catalog.
 *
 * Indexes one BM25 document per (tool, field), then aggregates weighted
 * scores back per tool. Klavis's field weights are empirically tuned.
 */
export class BM25Search<T extends ToolIndexable> {
  private readonly k1: number;
  private readonly b: number;
  private readonly tools: T[];
  private readonly documents: string[];
  private readonly documentWeights: number[];
  private readonly documentToolIdx: number[];

  constructor(tools: T[], opts: BM25SearchOptions = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    this.tools = tools;
    this.documents = [];
    this.documentWeights = [];
    this.documentToolIdx = [];

    tools.forEach((tool, idx) => {
      this.documents.push(preprocess(tool.service));
      this.documentWeights.push(FIELD_WEIGHTS.service);
      this.documentToolIdx.push(idx);

      this.documents.push(preprocess(tool.toolName));
      this.documentWeights.push(FIELD_WEIGHTS.toolName);
      this.documentToolIdx.push(idx);

      this.documents.push(preprocess(tool.description));
      this.documentWeights.push(FIELD_WEIGHTS.description);
      this.documentToolIdx.push(idx);
    });
  }

  /** Returns top-K hits, sorted by descending score. */
  search(query: string, topK = 5): SearchHit<T>[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];
    if (this.tools.length === 0) return [];

    const raw = BM25(this.documents, queryTerms, {
      k1: this.k1,
      b: this.b,
    }) as number[];

    const toolScores = new Array<number>(this.tools.length).fill(0);
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!Number.isFinite(s) || s <= 0) continue;
      toolScores[this.documentToolIdx[i]] += s * this.documentWeights[i];
    }

    const ranked: SearchHit<T>[] = [];
    for (let i = 0; i < toolScores.length; i++) {
      if (toolScores[i] > 0) {
        ranked.push({ tool: this.tools[i], score: toolScores[i] });
      }
    }
    ranked.sort((a, b) => b.score - a.score);
    return ranked.slice(0, topK);
  }
}
