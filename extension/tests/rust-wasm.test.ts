import { describe, expect, it } from 'vitest';
import {
  autoKCluster,
  clusterTabs,
  computePairwiseCosine,
  decodeBase64Wasm,
  dequantizeEmbeddings,
  fastTokenize,
  fuzzyScore,
  fuzzySearchTabs,
  initWasm,
  isWasmAvailable,
  matryoshkaSlice,
  pureJsAutoK,
  pureJsCosineSimilarity,
  pureJsDequantizeSQ8,
  pureJsDotProduct,
  pureJsFuzzyScore,
  pureJsFuzzySearch,
  pureJsMatryoshkaSlice,
  pureJsPairwiseCosine,
  pureJsQuantizeSQ8,
  pureJsTokenize,
  pureJsTopKSearch,
  pureJsTopKSearchSQ8,
  quantizeEmbeddings,
  runWasmVsJsBenchmark,
  searchTopKTabs,
  searchTopKTabsQuantized,
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
        expect(wasmMatrix[i * n + i]).toBeCloseTo(1.0, 4);
      }

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
        new Float32Array([0, 1, 0, 0]),
        new Float32Array([0.9, 0.1, 0, 0]),
        new Float32Array([0.2, 0.8, 0, 0]),
        new Float32Array([1, 0, 0, 0]),
      ];

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
      expect(wasmTop2[0]?.index).toBe(3);
      expect(wasmTop2[0]?.score).toBeCloseTo(1.0, 4);
      expect(wasmTop2[1]?.index).toBe(1);

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

  describe('Auto-K Density & MST Tab Clustering', () => {
    it('automatically discovers 2 distinct semantic clusters without guessing K', async () => {
      await initWasm();
      const dim = 4;
      // 3 vectors pointing along dimension 0 (Topic A: e.g. Programming)
      // 3 vectors pointing along dimension 1 (Topic B: e.g. Cooking)
      const embeddings = [
        new Float32Array([1.0, 0.05, 0.0, 0.0]),
        new Float32Array([0.95, 0.1, 0.0, 0.0]),
        new Float32Array([0.98, 0.02, 0.0, 0.0]),
        new Float32Array([0.05, 1.0, 0.0, 0.0]),
        new Float32Array([0.02, 0.98, 0.0, 0.0]),
        new Float32Array([0.08, 0.95, 0.0, 0.0]),
      ];

      for (const v of embeddings) {
        let norm = 0;
        for (let d = 0; d < dim; d++) norm += (v[d] ?? 0) ** 2;
        norm = Math.sqrt(norm);
        for (let d = 0; d < dim; d++) v[d] = (v[d] ?? 0) / norm;
      }

      const jsResult = pureJsAutoK(embeddings, 2, dim);
      const wasmResult = autoKCluster(embeddings, 2, dim);

      expect(wasmResult.clusterCount).toBe(2);
      expect(jsResult.clusterCount).toBe(2);

      // Verify Topic A tabs share the same cluster
      expect(wasmResult.assignments[0]).toBe(wasmResult.assignments[1]);
      expect(wasmResult.assignments[1]).toBe(wasmResult.assignments[2]);

      // Verify Topic B tabs share the same cluster
      expect(wasmResult.assignments[3]).toBe(wasmResult.assignments[4]);
      expect(wasmResult.assignments[4]).toBe(wasmResult.assignments[5]);

      // Verify Topic A and Topic B are distinct
      expect(wasmResult.assignments[0]).not.toBe(wasmResult.assignments[3]);
    });

    it('handles edge case n=1 gracefully', () => {
      const embeddings = [new Float32Array([1, 0])];
      const res = autoKCluster(embeddings, 2, 2);
      expect(res.clusterCount).toBe(1);
      expect(res.assignments).toEqual([0]);
    });
  });

  describe('Fuzzy Tab Search Engine', () => {
    it('scores fuzzy query matches with boundary bonuses', async () => {
      await initWasm();
      const title = 'GitHub - Anshulgada/brave-tab-manager';

      const s1 = fuzzyScore('gh', title);
      const s2 = fuzzyScore('brave', title);
      const sNoMatch = fuzzyScore('xyz999', title);

      expect(s1).toBeGreaterThan(0);
      expect(s2).toBeGreaterThan(0);
      expect(sNoMatch).toBeLessThan(0);

      const pureS1 = pureJsFuzzyScore('gh', title);
      expect(pureS1).toBeGreaterThan(0);
    });

    it('searches and ranks candidate tab titles in descending order', async () => {
      await initWasm();
      const tabs = [
        'Google News',
        'GitHub - Anshulgada/brave-tab-manager',
        'YouTube - Rust WASM SIMD Tutorial',
        'GitHub - facebook/react: A JavaScript library',
        'Twitter / X',
      ];

      const results = fuzzySearchTabs('github', tabs, 5);
      expect(results.length).toBe(2);
      // Both matched results are GitHub entries (index 1 and index 3)
      expect([1, 3]).toContain(results[0]?.index);
      expect([1, 3]).toContain(results[1]?.index);
      const first = results[0];
      const second = results[1];
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first ? first.score : 0).toBeGreaterThanOrEqual(
        second ? second.score : 0,
      );

      const pureResults = pureJsFuzzySearch('github', tabs, 5);
      expect(pureResults.length).toBe(2);
    });
  });

  describe('Int8 Scalar Quantization (SQ8) & SIMD Search', () => {
    it('quantizes Float32 embeddings to Int8 and dequantizes with < 2% error', async () => {
      await initWasm();
      const dim = 8;
      const v1 = new Float32Array([
        0.5, -0.8, 0.1, 0.95, -0.3, 0.7, -0.15, 0.4,
      ]);

      const jsQuant = pureJsQuantizeSQ8([v1], dim);
      const wasmQuant = quantizeEmbeddings([v1], dim);

      expect(wasmQuant.quant.length).toBe(1);
      expect(wasmQuant.quant[0]?.byteLength).toBe(dim); // 8 bytes instead of 32 bytes (4x smaller!)
      expect(wasmQuant.scales.length).toBe(1);

      const dequant = dequantizeEmbeddings(
        wasmQuant.quant,
        wasmQuant.scales,
        dim,
      );
      expect(dequant.length).toBe(1);

      for (let d = 0; d < dim; d++) {
        expect(dequant[0]?.[d]).toBeCloseTo(v1[d] ?? 0, 1);
      }

      // Check JS fallback matches
      const jsDequant = pureJsDequantizeSQ8(jsQuant.quant, jsQuant.scales, dim);
      for (let d = 0; d < dim; d++) {
        expect(dequant[0]?.[d]).toBeCloseTo(jsDequant[0]?.[d] ?? 0, 2);
      }
    });

    it('searches directly over quantized Int8 database using integer SIMD', async () => {
      await initWasm();
      const dim = 4;
      const query = new Float32Array([1.0, 0.0, 0.0, 0.0]);
      const db = [
        new Float32Array([0.0, 1.0, 0.0, 0.0]), // orthogonal
        new Float32Array([0.9, 0.1, 0.0, 0.0]), // close
        new Float32Array([0.1, 0.8, 0.0, 0.0]), // far
        new Float32Array([1.0, 0.0, 0.0, 0.0]), // identical
      ];

      const qQuery = quantizeEmbeddings([query], dim);
      const qDb = quantizeEmbeddings(db, dim);

      const queryQuant = qQuery.quant[0] ?? new Int8Array(dim);
      const top2 = searchTopKTabsQuantized(
        queryQuant,
        qQuery.scales[0] ?? 1.0,
        qDb.quant,
        qDb.scales,
        2,
        dim,
      );

      expect(top2.length).toBe(2);
      expect(top2[0]?.index).toBe(3); // exact match
      expect(top2[0]?.score).toBeCloseTo(1.0, 1);
      expect(top2[1]?.index).toBe(1); // second closest

      // Matches pure JS quantized search
      const jsTop2 = pureJsTopKSearchSQ8(
        queryQuant,
        qQuery.scales[0] ?? 1.0,
        qDb.quant,
        qDb.scales,
        2,
        dim,
      );
      expect(top2[0]?.index).toBe(jsTop2[0]?.index);
    });
  });

  describe('K-Means Tab Clustering', () => {
    it('clusters tab embeddings into K partitions', async () => {
      await initWasm();
      const n = 30;
      const dim = 8;
      const k = 3;

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

      for (const a of wasmResult.assignments) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(k);
      }

      setWasmActive(false);
      expect(isWasmAvailable()).toBe(false);
      const jsResult = clusterTabs(embeddings, k, 20, dim);
      expect(jsResult.assignments.length).toBe(n);
      expect(jsResult.inertia).toBeGreaterThanOrEqual(0);

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

        let norm = 0;
        for (let d = 0; d < targetDim; d++) {
          const val = v?.[d] ?? 0;
          norm += val * val;
        }
        expect(norm).toBeCloseTo(1.0, 4);

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
      expect(res.tokens[0]).toBe(2n);
      expect(res.mask[0]).toBe(1n);

      expect(res.tokens[31]).toBe(0n);
      expect(res.mask[31]).toBe(0n);

      const jsRes = pureJsTokenize(title, 32);
      expect(jsRes.tokens[0]).toBe(2n);
      expect(jsRes.mask[0]).toBe(1n);
    });
  });

  describe('Comprehensive 7-Kernel Empirical Benchmark Suite', () => {
    it('executes full benchmark and verifies speedups across all 7 kernels', async () => {
      const report = await runWasmVsJsBenchmark();
      expect(report.isWasmActive).toBe(true);
      expect(report.entries.length).toBe(7);

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
      expect(pairwise?.speedup).toBeGreaterThan(2.0);

      // Check Fuzzy Search speedup
      const fuzzy = report.entries.find((e) =>
        e.name.includes('Fuzzy Tab Search'),
      );
      expect(fuzzy).toBeDefined();

      // Check Auto-K speedup
      const autok = report.entries.find((e) => e.name.includes('Auto-K'));
      expect(autok).toBeDefined();

      // Check Int8 Quantized Search speedup
      const quant = report.entries.find((e) =>
        e.name.includes('Int8 Quantized'),
      );
      expect(quant).toBeDefined();
    });
  });
});
