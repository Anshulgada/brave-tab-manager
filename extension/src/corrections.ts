/**
 * Human-in-the-Loop correction store and fast kNN memory cache.
 *
 * Captures user approvals, renames, and edits. Computes instant cosine
 * similarity matching (threshold >= 0.85) so Tabman adapts immediately
 * without waiting for full model retraining.
 */

import type { CorrectionRecord, TabmanDatabase } from './database';

export interface KnnMatch {
  matchedRecord: CorrectionRecord;
  similarity: number;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Compute cosine similarity between two normalized 128d vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
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
  const record: CorrectionRecord = {
    id,
    url: item.url,
    title: item.title,
    hostname: item.hostname,
    collectionName: item.collectionName,
    tags: item.tags,
    action: item.action,
    timestamp: new Date().toISOString(),
    embedding: item.embedding,
  };
  await db.corrections.put(record);
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
