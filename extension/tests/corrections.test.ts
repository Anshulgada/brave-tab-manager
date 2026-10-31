import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import {
  cosineSimilarity,
  exportCorrectionsJsonl,
  findNearestCorrection,
  recordCorrection,
  textJaccardSimilarity,
} from '../src/corrections';
import { TabmanDatabase } from '../src/database';

let dbCounter = 0;
const openDatabases: TabmanDatabase[] = [];
const dbNames = new Set<string>();

function createTestDb(): TabmanDatabase {
  dbCounter += 1;
  const name = `tabman-corrections-test-${dbCounter}`;
  dbNames.add(name);
  const db = new TabmanDatabase(name);
  openDatabases.push(db);
  return db;
}

afterEach(async () => {
  for (const db of openDatabases.splice(0)) {
    db.close();
  }
  await Promise.all([...dbNames].map((name) => Dexie.delete(name)));
  dbNames.clear();
});

describe('vector and text similarity math', () => {
  it('computes cosine similarity accurately', () => {
    // Identical normalized vectors
    const vecA = [0.6, 0.8];
    const vecB = [0.6, 0.8];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(1.0, 5);

    // Orthogonal vectors
    const vecC = [1, 0];
    const vecD = [0, 1];
    expect(cosineSimilarity(vecC, vecD)).toBeCloseTo(0.0, 5);

    // Opposing vectors
    const vecE = [1, 0];
    const vecF = [-1, 0];
    expect(cosineSimilarity(vecE, vecF)).toBeCloseTo(-1.0, 5);

    // Dimension mismatch returns 0
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });

  it('computes text Jaccard similarity', () => {
    const textA = 'react typescript frontend vite';
    const textB = 'react typescript frontend vite';
    expect(textJaccardSimilarity(textA, textB)).toBe(1.0);

    const textC = 'react typescript frontend';
    const textD = 'react typescript backend python';
    // words in C: react, typescript, frontend (3)
    // words in D: react, typescript, backend, python (4)
    // intersection: react, typescript (2)
    // union: 5 -> 2/5 = 0.4
    expect(textJaccardSimilarity(textC, textD)).toBeCloseTo(0.4, 2);

    expect(textJaccardSimilarity('', '')).toBe(0);
  });
});

describe('corrections storage and kNN lookup', () => {
  it('records approvals and exports to JSONL', async () => {
    const db = createTestDb();

    await recordCorrection(db, {
      url: 'https://github.com/facebook/react',
      title: 'React GitHub Repository',
      hostname: 'github.com',
      collectionName: 'Frontend Libraries',
      tags: ['react', 'ui'],
      action: 'approve',
      embedding: [0.1, 0.2, 0.3],
    });

    await recordCorrection(db, {
      url: 'https://docs.anthropic.com',
      title: 'Claude API Documentation',
      hostname: 'docs.anthropic.com',
      collectionName: 'AI & LLM Docs',
      tags: ['ai', 'claude'],
      action: 'edit',
    });

    const records = await db.corrections.toArray();
    expect(records).toHaveLength(2);
    const approved = records.find((r) => r.action === 'approve');
    const edited = records.find((r) => r.action === 'edit');
    expect(approved?.collectionName).toBe('Frontend Libraries');
    expect(edited?.collectionName).toBe('AI & LLM Docs');

    const jsonl = await exportCorrectionsJsonl(db);
    const lines = jsonl.trim().split('\n');
    expect(lines).toHaveLength(2);

    const parsed = lines.map((line) => JSON.parse(line));
    expect(
      parsed.some(
        (p) =>
          p.title === 'React GitHub Repository' &&
          p.collectionName === 'Frontend Libraries',
      ),
    ).toBe(true);
    expect(
      parsed.some(
        (p) =>
          p.title === 'Claude API Documentation' &&
          p.collectionName === 'AI & LLM Docs',
      ),
    ).toBe(true);
  });

  it('matches nearest neighbor using vector embeddings', async () => {
    const db = createTestDb();

    await recordCorrection(db, {
      url: 'https://pytorch.org/docs',
      title: 'PyTorch Documentation',
      hostname: 'pytorch.org',
      collectionName: 'Machine Learning',
      tags: ['pytorch', 'cuda'],
      action: 'approve',
      embedding: [0.9, 0.1, 0.0],
    });

    // Query with very close embedding
    const match = await findNearestCorrection(
      db,
      {
        title: 'PyTorch Tutorials',
        url: 'https://pytorch.org/tutorials',
        hostname: 'pytorch.org',
        embedding: [0.92, 0.08, 0.0],
      },
      0.85,
    );

    expect(match).not.toBeNull();
    expect(match?.matchedRecord.collectionName).toBe('Machine Learning');
    expect(match?.similarity).toBeGreaterThan(0.95);
    expect(match?.confidence).toBe('high');
  });

  it('falls back to text Jaccard similarity when no embedding is present', async () => {
    const db = createTestDb();

    await recordCorrection(db, {
      url: 'https://developer.mozilla.org/en-US/docs/Web/API',
      title: 'Web APIs MDN Documentation',
      hostname: 'developer.mozilla.org',
      collectionName: 'Web Development',
      tags: ['mdn', 'javascript'],
      action: 'approve',
    });

    // High lexical overlap
    const match = await findNearestCorrection(
      db,
      {
        title: 'Web APIs MDN Documentation Reference',
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API',
        hostname: 'developer.mozilla.org',
      },
      0.7,
    );

    expect(match).not.toBeNull();
    expect(match?.matchedRecord.collectionName).toBe('Web Development');

    // Query with low overlap returns null
    const noMatch = await findNearestCorrection(
      db,
      {
        title: 'Completely Unrelated Cooking Recipe',
        url: 'https://recipes.example.com',
        hostname: 'recipes.example.com',
      },
      0.85,
    );
    expect(noMatch).toBeNull();
  });
});
