/**
 * Human-in-the-Loop correction store and fast kNN memory cache.
 *
 * Captures user approvals, renames, and edits. Computes instant cosine
 * similarity matching (threshold >= 0.85) so Tabman adapts immediately
 * without waiting for full model retraining.
 */

import type { CorrectionRecord, TabmanDatabase } from './database';
import {
  computePairwiseCosine,
  createVectorStore,
  getVectorStoreTabId,
  matryoshkaSlice,
  pureJsCosineSimilarity,
  quantizeEmbeddings,
  searchTopKTabs,
  searchTopKTabsQuantized,
  searchVectorStore,
} from './rust-wasm';

export interface KnnMatch {
  matchedRecord: CorrectionRecord;
  similarity: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Compute cosine similarity between two normalized 128d vectors using Rust WASM / SIMD kernel.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  return pureJsCosineSimilarity(new Float32Array(a), new Float32Array(b));
}

/**
 * Text token Jaccard similarity fallback when vector embeddings are not yet cached.
 */
export function textJaccardSimilarity(textA: string, textB: string): number {
  const tokenize = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  const setA = tokenize(textA);
  const setB = tokenize(textB);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Record a user approval or manual edit in IndexedDB.
 */
export async function recordCorrection(
  db: TabmanDatabase,
  item: {
    url: string;
    title: string;
    hostname: string;
    collectionName: string;
    tags: string[];
    action: 'approve' | 'edit';
    embedding?: number[];
  },
): Promise<void> {
  const id = crypto.randomUUID();
  let embedding = item.embedding;
  if (embedding && embedding.length > 128) {
    const sliced = matryoshkaSlice(
      [new Float32Array(embedding)],
      128,
      embedding.length,
    );
    const first = sliced[0];
    if (first) {
      embedding = Array.from(first);
    }
  }
  const record: CorrectionRecord = {
    id,
    url: item.url,
    title: item.title,
    hostname: item.hostname,
    collectionName: item.collectionName,
    tags: item.tags,
    action: item.action,
    timestamp: new Date().toISOString(),
    embedding,
  };
  await db.corrections.put(record);
}

/**
 * Compute the full pairwise cosine similarity matrix across all stored correction records.
 */
export function computeCorrectionsSimilarityMatrix(
  records: CorrectionRecord[],
  dim = 128,
): Float32Array {
  const vectors: Float32Array[] = [];
  for (const r of records) {
    if (r.embedding && r.embedding.length === dim) {
      vectors.push(new Float32Array(r.embedding));
    }
  }
  if (vectors.length === 0) return new Float32Array(0);
  return computePairwiseCosine(vectors, dim);
}

/**
 * Builds a Zero-Copy Binary Vector Store (TABV) buffer from correction records.
 */
export function createCorrectionsVectorStore(
  records: CorrectionRecord[],
  dim = 128,
  quantize = true,
): Uint8Array {
  const valid = records.filter(
    (r) => r.embedding && r.embedding.length === dim,
  );
  const ids = valid.map((r) => r.id);
  const vectors = valid.map((r) => new Float32Array(r.embedding ?? []));
  return createVectorStore(ids, vectors, dim, quantize);
}

/**
 * Search the Zero-Copy Binary Vector Store directly in WASM memory.
 */
export function searchCorrectionsVectorStore(
  storeBuffer: Uint8Array,
  records: CorrectionRecord[],
  queryVec: Float32Array,
  k = 5,
  threshold = 0.85,
): KnnMatch[] {
  const topResults = searchVectorStore(storeBuffer, queryVec, k);
  const matches: KnnMatch[] = [];
  const recordMap = new Map(records.map((r) => [r.id, r]));

  for (const res of topResults) {
    if (res.score >= threshold) {
      const id = getVectorStoreTabId(storeBuffer, res.index);
      if (id) {
        const record = recordMap.get(id);
        if (record) {
          matches.push({
            matchedRecord: record,
            similarity: res.score,
            confidence: res.score >= 0.92 ? 'high' : 'medium',
          });
        }
      }
    }
  }
  return matches;
}

/**
 * Find the nearest neighbor from stored user corrections.
 */
export async function findNearestCorrection(
  db: TabmanDatabase,
  query: {
    title: string;
    url: string;
    hostname: string;
    embedding?: number[];
  },
  threshold = 0.85,
): Promise<KnnMatch | null> {
  const allCorrections = await db.corrections.toArray();
  if (allCorrections.length === 0) return null;

  if (query.embedding && query.embedding.length > 0) {
    let queryEmbedding = query.embedding;
    if (queryEmbedding.length > 128) {
      const sliced = matryoshkaSlice(
        [new Float32Array(queryEmbedding)],
        128,
        queryEmbedding.length,
      );
      const first = sliced[0];
      if (first) {
        queryEmbedding = Array.from(first);
      }
    }
    const dim = queryEmbedding.length;
    const recordsWithEmb = allCorrections.filter(
      (r) => r.embedding && r.embedding.length === dim,
    );
    if (recordsWithEmb.length > 0) {
      const queryVec = new Float32Array(queryEmbedding);
      const dbVecs = recordsWithEmb.map(
        (r) => new Float32Array(r.embedding ?? []),
      );

      let topIndex = -1;
      let topScore = -1;

      if (recordsWithEmb.length >= 8) {
        // High density: Accelerated Int8 Quantized SIMD Search
        const qDb = quantizeEmbeddings(dbVecs, dim);
        const qQuery = quantizeEmbeddings([queryVec], dim);
        const queryQuant = qQuery.quant[0] ?? new Int8Array(dim);
        const queryScale = qQuery.scales[0] ?? 1.0;
        const topResults = searchTopKTabsQuantized(
          queryQuant,
          queryScale,
          qDb.quant,
          qDb.scales,
          1,
          dim,
        );
        const top = topResults[0];
        if (top) {
          topIndex = top.index;
          topScore = top.score;
        }
      } else {
        // Standard Top-K Vector Search
        const topResults = searchTopKTabs(queryVec, dbVecs, 1, dim);
        const top = topResults[0];
        if (top) {
          topIndex = top.index;
          topScore = top.score;
        }
      }

      if (topIndex >= 0 && topScore >= threshold) {
        const match = recordsWithEmb[topIndex];
        if (match) {
          return {
            matchedRecord: match,
            similarity: topScore,
            confidence: topScore >= 0.92 ? 'high' : 'medium',
          };
        }
      }
    }
  }

  let bestMatch: CorrectionRecord | null = null;
  let highestSim = -1;

  for (const record of allCorrections) {
    let sim = 0;
    if (
      query.embedding &&
      record.embedding &&
      query.embedding.length === record.embedding.length
    ) {
      sim = cosineSimilarity(query.embedding, record.embedding);
    } else {
      const qText = `${query.title} ${query.hostname}`;
      const rText = `${record.title} ${record.hostname}`;
      sim = textJaccardSimilarity(qText, rText);
    }

    if (sim > highestSim) {
      highestSim = sim;
      bestMatch = record;
    }
  }

  if (bestMatch && highestSim >= threshold) {
    return {
      matchedRecord: bestMatch,
      similarity: highestSim,
      confidence: highestSim >= 0.92 ? 'high' : 'medium',
    };
  }

  return null;
}

/**
 * Export all stored corrections formatted as JSONL for model fine-tuning.
 */
export async function exportCorrectionsJsonl(
  db: TabmanDatabase,
): Promise<string> {
  const all = await db.corrections.toArray();
  const lines = all.map((c) =>
    JSON.stringify({
      url: c.url,
      title: c.title,
      hostname: c.hostname,
      collectionName: c.collectionName,
      tags: c.tags,
      action: c.action,
      timestamp: c.timestamp,
    }),
  );
  return lines.join('\n');
}
