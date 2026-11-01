import { describe, expect, it } from 'vitest';
import {
  clusterTabs,
  computePairwiseCosine,
  decodeBase64Wasm,
  fastTokenize,
  initWasm,
  isWasmAvailable,
  matryoshkaSlice,
  pureJsCosineSimilarity,
  pureJsDotProduct,
  pureJsMatryoshkaSlice,
  pureJsPairwiseCosine,
  pureJsTokenize,
  pureJsTopKSearch,
  runWasmVsJsBenchmark,
  searchTopKTabs,
  setWasmActive,
} from '../src/rust-wasm';
import {
  TABMAN_WASM_BASE64,
  TABMAN_WASM_BYTE_LENGTH,
} from '../src/rust-wasm-binary';

describe('Rust WASM SIMD Acceleration Engine', () => {
  it('decodes the compiled WASM binary with exact byte length', () => {
    const bytes = decodeBase64Wasm(TABMAN_WASM_BASE64);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(TABMAN_WASM_BYTE_LENGTH);
    // WASM magic header: \0asm (0x00, 0x61, 0x73, 0x6D)
    expect(bytes[0]).toBe(0x00);
    expect(bytes[1]).toBe(0x61);
    expect(bytes[2]).toBe(0x73);
    expect(bytes[3]).toBe(0x6d);
  });

  it('initializes WASM module and reports availability', async () => {
    const ok = await initWasm();
    expect(ok).toBe(true);
    expect(isWasmAvailable()).toBe(true);
  });

  describe('Vector math & Pairwise Cosine Matrix', () => {
    it('computes dot products and cosine similarities accurately', () => {
      const a = new Float32Array([1, 0, 0, 0]);
      const b = new Float32Array([0, 1, 0, 0]);
      const c = new Float32Array([1, 0, 0, 0]);

      expect(pureJsDotProduct(a, b)).toBe(0);
      expect(pureJsCosineSimilarity(a, b)).toBe(0);
      expect(pureJsCosineSimilarity(a, c)).toBeCloseTo(1.0, 5);
    });

    it('computes NxN pairwise cosine matrix in WASM matching JS results', async () => {
      await initWasm();
      const n = 10;
      const dim = 16;
      const embeddings: Float32Array[] = [];

      for (let i = 0; i < n; i++) {
        const v = new Float32Array(dim);
        for (let d = 0; d < dim; d++) {
          v[d] = Math.sin((i + 1) * 7 + (d + 1) * 3);
        }
        // Unit normalize
        let norm = 0;
        for (let d = 0; d < dim; d++) {
          const val = v[d] ?? 0;
          norm += val * val;
        }
        norm = Math.sqrt(norm);
        for (let d = 0; d < dim; d++) {
          v[d] = (v[d] ?? 0) / norm;
        }
        embeddings.push(v);
      }

      const jsMatrix = pureJsPairwiseCosine(embeddings, dim);
      const wasmMatrix = computePairwiseCosine(embeddings, dim);

      expect(wasmMatrix.length).toBe(n * n);
      for (let i = 0; i < n; i++) {
        // Diagonal must be 1.0
        expect(wasmMatrix[i * n + i]).toBeCloseTo(1.0, 4);
      }

      // WASM and JS must match within 1e-4
      for (let i = 0; i < n * n; i++) {
        const jVal = jsMatrix[i] ?? 0;
        const wVal = wasmMatrix[i] ?? 0;
        expect(Math.abs(jVal - wVal)).toBeLessThan(1e-4);
      }
    });

    it('handles edge cases (empty array, zero dimension)', () => {
      expect(computePairwiseCosine([], 0).length).toBe(0);
      expect(pureJsPairwiseCosine([], 0).length).toBe(0);
    });
  });

  describe('Top-K Vector Search Index', () => {
    it('retrieves top-K nearest tabs in descending order', async () => {
      await initWasm();
      const dim = 4;
      const query = new Float32Array([1, 0, 0, 0]);
      const db = [
        new Float32Array([0, 1, 0, 0]), // orthogonal (sim ~0)
        new Float32Array([0.9, 0.1, 0, 0]), // close (sim ~0.99)
        new Float32Array([0.2, 0.8, 0, 0]), // moderate
        new Float32Array([1, 0, 0, 0]), // exact match (sim 1.0)
      ];

      // Normalize db
      for (const v of db) {
        let norm = 0;
        for (let d = 0; d < dim; d++) {
          const val = v[d] ?? 0;
          norm += val * val;
        }
        norm = Math.sqrt(norm);
        for (let d = 0; d < dim; d++) {
          v[d] = (v[d] ?? 0) / norm;
        }
      }

      const jsTop2 = pureJsTopKSearch(query, db, 2, dim);
      const wasmTop2 = searchTopKTabs(query, db, 2, dim);

      expect(wasmTop2.length).toBe(2);
      expect(wasmTop2[0]?.index).toBe(3); // exact match
      expect(wasmTop2[0]?.score).toBeCloseTo(1.0, 4);
      expect(wasmTop2[1]?.index).toBe(1); // second closest

      // Matches pure JS top-K
      expect(wasmTop2[0]?.index).toBe(jsTop2[0]?.index);
      expect(wasmTop2[1]?.index).toBe(jsTop2[1]?.index);
    });

    it('handles k larger than database size gracefully', () => {
      const query = new Float32Array([1, 0]);
      const db = [new Float32Array([1, 0])];
      const results = searchTopKTabs(query, db, 10, 2);
      expect(results.length).toBe(1);
      expect(results[0]?.index).toBe(0);
    });
  });

  describe('K-Means Tab Clustering', () => {
    it('clusters tab embeddings into K partitions', async () => {
      await initWasm();
      const n = 30;
      const dim = 8;
      const k = 3;

      // 3 clusters around basis axes
      const embeddings: Float32Array[] = [];
      for (let i = 0; i < n; i++) {
        const clusterId = i % 3;
        const v = new Float32Array(dim);
        v[clusterId] = 1.0;
        v[(clusterId + 3) % dim] = 0.2 * ((i % 5) - 2);

        let norm = 0;
        for (let d = 0; d < dim; d++) {
          const val = v[d] ?? 0;
          norm += val * val;
        }
        norm = Math.sqrt(norm);
        for (let d = 0; d < dim; d++) {
          v[d] = (v[d] ?? 0) / norm;
        }
        embeddings.push(v);
      }

      const wasmResult = clusterTabs(embeddings, k, 20, dim);
      expect(wasmResult.assignments.length).toBe(n);
      expect(wasmResult.inertia).toBeGreaterThanOrEqual(0);

      // Verify every assignment is in 0..k-1
      for (const a of wasmResult.assignments) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(k);
      }

      // Verify pure JS fallback works when WASM disabled
      setWasmActive(false);
      expect(isWasmAvailable()).toBe(false);
      const jsResult = clusterTabs(embeddings, k, 20, dim);
      expect(jsResult.assignments.length).toBe(n);
      expect(jsResult.inertia).toBeGreaterThanOrEqual(0);

      // Restore WASM
      setWasmActive(true);
      expect(isWasmAvailable()).toBe(true);
    });

    it('handles edge case k=1', () => {
      const embeddings = [new Float32Array([1, 0]), new Float32Array([0, 1])];
      const res = clusterTabs(embeddings, 1, 10, 2);
      expect(res.assignments).toEqual([0, 0]);
      expect(res.inertia).toBe(0);
    });
  });

  describe('Matryoshka Dimension Slicing & L2 Normalization', () => {
    it('slices 768d vectors down to 128d and normalizes in SIMD', async () => {
      await initWasm();
      const n = 5;
      const origDim = 32;
      const targetDim = 8;

      const embeddings: Float32Array[] = [];
      for (let i = 0; i < n; i++) {
        const v = new Float32Array(origDim);
        for (let d = 0; d < origDim; d++) {
          v[d] = (i + 1) * 0.1 + d * 0.05;
        }
        embeddings.push(v);
      }

      const jsSliced = pureJsMatryoshkaSlice(embeddings, targetDim);
      const wasmSliced = matryoshkaSlice(embeddings, targetDim, origDim);

      expect(wasmSliced.length).toBe(n);
      for (let i = 0; i < n; i++) {
        const v = wasmSliced[i];
        expect(v?.length).toBe(targetDim);

        // Verify L2 norm is 1.0
        let norm = 0;
        for (let d = 0; d < targetDim; d++) {
          const val = v?.[d] ?? 0;
          norm += val * val;
        }
        expect(norm).toBeCloseTo(1.0, 4);

        // Verify match with JS implementation
        const jsV = jsSliced[i];
        for (let d = 0; d < targetDim; d++) {
          expect(v?.[d]).toBeCloseTo(jsV?.[d] ?? 0, 4);
        }
      }
    });
  });

  describe('Sequence Tokenization for Gemma', () => {
    it('tokenizes title into bounded token array with BOS token', async () => {
      await initWasm();
      const title = 'GitHub - Anshulgada/brave-tab-manager: Fast tab organizer';
      const res = fastTokenize(title, 32);

      expect(res.length).toBeGreaterThan(1);
      expect(res.length).toBeLessThanOrEqual(32);
      expect(res.tokens[0]).toBe(2n); // Gemma BOS
      expect(res.mask[0]).toBe(1n);

      // Verify padding
      expect(res.tokens[31]).toBe(0n);
      expect(res.mask[31]).toBe(0n);

      // Compare with pure JS tokenization
      const jsRes = pureJsTokenize(title, 32);
      expect(jsRes.tokens[0]).toBe(2n);
      expect(jsRes.mask[0]).toBe(1n);
    });
  });

  describe('Empirical Benchmark Suite', () => {
    it('executes full benchmark and verifies speedups', async () => {
      const report = await runWasmVsJsBenchmark();
      expect(report.isWasmActive).toBe(true);
      expect(report.entries.length).toBe(4);

      for (const entry of report.entries) {
        expect(entry.jsLatencyMs).toBeGreaterThan(0);
        expect(entry.wasmLatencyMs).toBeGreaterThan(0);
        expect(entry.speedup).toBeGreaterThan(0.5);
      }

      // Check Pairwise Cosine Matrix speedup
      const pairwise = report.entries.find((e) =>
        e.name.includes('Pairwise Cosine'),
      );
      expect(pairwise).toBeDefined();
      expect(pairwise?.speedup).toBeGreaterThan(2.0); // At least 2x-11x faster
    });
  });
});
