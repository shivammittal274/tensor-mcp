// wink-porter2-stemmer ships no .d.ts and has no @types package upstream.
// @ts-expect-error — declared as a typed re-export below.
import stemRaw from "wink-porter2-stemmer";
const stem = stemRaw as (token: string) => string;

/**
 * Field-flattened BM25+ search over a tool catalog.
 *
 * Algorithm (adapted from Klavis open-strata's `bm25_search.py`):
 *
 * 1. Each tool produces one "document" per scoring field (service, operation,
 *    description, ...). Each flattened document remembers its source tool and
 *    its field weight.
 * 2. BM25+ scores each flattened document independently against the query.
 * 3. Final tool score = sum(field_score * field_weight) across all flattened
 *    documents for that tool.
 *
 * BM25+ vs base BM25: adds a +delta term that prevents long documents from
 * being scored below short non-matching documents on partial matches. We use
 * the standard delta=1 (Lv & Zhai, 2011).
 *
 * Tokenization: lowercase, replace _/-/camelCase boundaries with spaces, then
 * apply Porter2 (Snowball English) stemming so "story" matches "stories" and
 * "create" matches "creating".
 */

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
  /** Standard BM25 free param. Default 1.2 (well-tuned for short documents). */
  k1?: number;
  /** Length normalization 0–1. Default 0.75 (BM25 standard). */
  b?: number;
  /** BM25+ saturation floor. Default 1.0 (Lv & Zhai). */
  delta?: number;
  /** Disable Porter2 stemming (useful when indexing non-English content). */
  noStem?: boolean;
}

/**
 * Field weights — mirrors open-strata's uniform-30 approach for primary fields,
 * lighter weight for parameter names + descriptions. Tuned so a strong match
 * on description carries the same signal as a strong match on the tool name.
 */
const FIELD_WEIGHTS = {
  service: 30,
  operation: 30,
  description: 30,
} as const;

type FieldKey = keyof typeof FIELD_WEIGHTS;

interface FlattenedDoc {
  tokens: string[];
  toolIdx: number;
  weight: number;
}

function preprocess(text: string): string {
  let s = text.replace(/[_-]/g, " ");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  s = s.replace(/\s+/g, " ").trim();
  return s.toLowerCase();
}

function tokenize(text: string, stemEnabled: boolean): string[] {
  const tokens = preprocess(text).split(/\s+/).filter(Boolean);
  if (!stemEnabled) return tokens;
  return tokens.map((t) => stem(t));
}

export class BM25Search<T extends ToolIndexable> {
  private readonly k1: number;
  private readonly b: number;
  private readonly delta: number;
  private readonly stemEnabled: boolean;
  private readonly tools: T[];
  private readonly docs: FlattenedDoc[];
  private readonly avgDocLen: number;
  /** docCountByTerm[term] = number of flattened documents containing the term. */
  private readonly df: Map<string, number>;
  private readonly totalDocs: number;

  constructor(tools: T[], opts: BM25SearchOptions = {}) {
    this.k1 = opts.k1 ?? 1.2;
    this.b = opts.b ?? 0.75;
    this.delta = opts.delta ?? 1.0;
    this.stemEnabled = !opts.noStem;
    this.tools = tools;

    this.docs = [];
    tools.forEach((tool, idx) => {
      const fields: Record<FieldKey, string> = {
        service: tool.service,
        operation: tool.toolName,
        description: tool.description,
      };
      for (const [key, value] of Object.entries(fields) as Array<
        [FieldKey, string]
      >) {
        if (!value) continue;
        const tokens = tokenize(value, this.stemEnabled);
        if (tokens.length === 0) continue;
        this.docs.push({ tokens, toolIdx: idx, weight: FIELD_WEIGHTS[key] });
      }
    });

    this.totalDocs = this.docs.length;
    this.avgDocLen = this.totalDocs
      ? this.docs.reduce((sum, d) => sum + d.tokens.length, 0) / this.totalDocs
      : 0;

    this.df = new Map();
    for (const doc of this.docs) {
      const seen = new Set<string>();
      for (const t of doc.tokens) {
        if (!seen.has(t)) {
          seen.add(t);
          this.df.set(t, (this.df.get(t) ?? 0) + 1);
        }
      }
    }
  }

  /** Returns top-K tool hits, sorted by aggregated score (descending). */
  search(query: string, topK = 5): SearchHit<T>[] {
    const queryTerms = tokenize(query, this.stemEnabled);
    if (queryTerms.length === 0 || this.totalDocs === 0) return [];

    const toolScores = new Array<number>(this.tools.length).fill(0);

    for (const doc of this.docs) {
      const tf = countTerms(doc.tokens, queryTerms);
      if (tf.size === 0) continue;

      let docScore = 0;
      const lenNorm = 1 - this.b + (this.b * doc.tokens.length) / this.avgDocLen;
      for (const [term, freq] of tf) {
        const dfT = this.df.get(term) ?? 0;
        // BM25 IDF with the "+1" smoothing to keep it non-negative.
        const idf = Math.log(1 + (this.totalDocs - dfT + 0.5) / (dfT + 0.5));
        const tfSat = (freq * (this.k1 + 1)) / (freq + this.k1 * lenNorm);
        // BM25+ delta — the +δ on the saturation term.
        docScore += idf * (tfSat + this.delta);
      }

      toolScores[doc.toolIdx] += docScore * doc.weight;
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

function countTerms(docTokens: string[], queryTerms: string[]): Map<string, number> {
  const querySet = new Set(queryTerms);
  const tf = new Map<string, number>();
  for (const t of docTokens) {
    if (querySet.has(t)) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
  }
  return tf;
}
