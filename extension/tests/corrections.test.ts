import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import {
  computeCorrectionsSimilarityMatrix,
  cosineSimilarity,
  createCorrectionsVectorStore,
  exportCorrectionsJsonl,
  findNearestCorrection,
  recordCorrection,
  searchCorrectionsVectorStore,
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

  it('slices high-dimensional (768d) embeddings to 128d with Matryoshka projection', async () => {
    const db = createTestDb();

    // 768d embedding (e.g. from Gemma / Nomic)
    const bigEmb = new Array(768).fill(0);
    bigEmb[0] = 0.8;
    bigEmb[1] = 0.6;

    await recordCorrection(db, {
      url: 'https://huggingface.co/models',
      title: 'Hugging Face Models',
      hostname: 'huggingface.co',
      collectionName: 'AI Models',
      tags: ['huggingface', 'llm'],
      action: 'approve',
      embedding: bigEmb,
    });

    const records = await db.corrections.toArray();
    expect(records).toHaveLength(1);
    expect(records[0]?.embedding?.length).toBe(128);

    const queryBig = new Array(768).fill(0);
    queryBig[0] = 0.82;
    queryBig[1] = 0.58;

    const match = await findNearestCorrection(
      db,
      {
        title: 'Hugging Face Hub',
        url: 'https://huggingface.co/hub',
        hostname: 'huggingface.co',
        embedding: queryBig,
      },
      0.85,
    );
    expect(match).not.toBeNull();
    expect(match?.matchedRecord.collectionName).toBe('AI Models');
  });

  it('computes pairwise cosine matrix and builds zero-copy TABV binary vector store', async () => {
    const db = createTestDb();

    for (let i = 0; i < 10; i++) {
      const v = new Array(128).fill(0);
      v[i] = 1.0; // orthogonal unit vectors
      await recordCorrection(db, {
        url: `https://example.com/item-${i}`,
        title: `Item ${i}`,
        hostname: 'example.com',
        collectionName: `Category ${i}`,
        tags: [`tag-${i}`],
        action: 'approve',
        embedding: v,
      });
    }

    const all = await db.corrections.toArray();
    expect(all).toHaveLength(10);

    // Pairwise similarity matrix (Kernel 1)
    const matrix = computeCorrectionsSimilarityMatrix(all, 128);
    expect(matrix.length).toBe(100); // 10x10
    expect(matrix[0]).toBeCloseTo(1.0, 4); // diagonal self-similarity
    expect(matrix[1]).toBeCloseTo(0.0, 4); // orthogonal

    // TABV Zero-Copy binary vector store (Kernel 10)
    const storeBuffer = createCorrectionsVectorStore(all, 128, true);
    expect(storeBuffer.byteLength).toBeGreaterThan(64);
    expect(storeBuffer[0]).toBe(0x54); // 'T'
    expect(storeBuffer[1]).toBe(0x41); // 'A'
    expect(storeBuffer[2]).toBe(0x42); // 'B'
    expect(storeBuffer[3]).toBe(0x56); // 'V'

    const queryVec = new Float32Array(128);
    queryVec[3] = 1.0;
    const matches = searchCorrectionsVectorStore(
      storeBuffer,
      all,
      queryVec,
      3,
      0.8,
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0]?.matchedRecord.collectionName).toBe('Category 3');

    // Also tests Accelerated Int8 Quantized SIMD Search in findNearestCorrection
    const nearest = await findNearestCorrection(
      db,
      {
        title: 'Query Item 3',
        url: 'https://example.com/item-3',
        hostname: 'example.com',
        embedding: Array.from(queryVec),
      },
      0.8,
    );
    expect(nearest).not.toBeNull();
    expect(nearest?.matchedRecord.collectionName).toBe('Category 3');
  });
});
