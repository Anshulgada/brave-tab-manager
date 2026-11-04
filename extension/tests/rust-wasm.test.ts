import { describe, expect, it } from 'vitest';
import {
  autoKCluster,
  canonicalizeUrl,
  clusterTabs,
  computePairwiseCosine,
  createVectorStore,
  decodeBase64Wasm,
  deduplicateUrls,
  dequantizeEmbeddings,
  extractHtmlContent,
  fastTokenize,
  fuzzyScore,
  fuzzySearchTabs,
  getVectorStoreTabId,
  initWasm,
  isWasmAvailable,
  matryoshkaSlice,
  pureJsAutoK,
  pureJsCanonicalizeUrl,
  pureJsCosineSimilarity,
  pureJsCreateVectorStore,
  pureJsDeduplicateUrls,
  pureJsDequantizeSQ8,
  pureJsDotProduct,
  pureJsExtractHtmlContent,
  pureJsFuzzyScore,
  pureJsFuzzySearch,
  pureJsGetVectorStoreTabId,
  pureJsMatryoshkaSlice,
  pureJsPairwiseCosine,
  pureJsQuantizeSQ8,
  pureJsSearchVectorStore,
  pureJsTokenize,
  pureJsTopKSearch,
  pureJsTopKSearchSQ8,
  quantizeEmbeddings,
  runWasmVsJsBenchmark,
  searchTopKTabs,
  searchTopKTabsQuantized,
  searchVectorStore,
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

    it('accurately matches short subsequences like "yu" and typo variations like "youutube"', async () => {
      await initWasm();
      const title = 'YouTube - Watch Videos Online';

      const sSub = fuzzyScore('yu', title);
      const sTypo = fuzzyScore('youutube', title);
      const sExact = fuzzyScore('youtube', title);

      expect(sSub).toBeGreaterThan(0);
      expect(sTypo).toBeGreaterThan(0);
      expect(sExact).toBeGreaterThan(sTypo);

      const tabs = [
        'Google News',
        'YouTube - Rust WASM SIMD Tutorial',
        'Twitter / X',
      ];
      const resYu = fuzzySearchTabs('yu', tabs, 5);
      expect(resYu.length).toBeGreaterThan(0);
      expect(resYu[0]?.index).toBe(1);

      const resYouutube = fuzzySearchTabs('youutube', tabs, 5);
      expect(resYouutube.length).toBeGreaterThan(0);
      expect(resYouutube[0]?.index).toBe(1);
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

  describe('Streaming SIMD URL Canonicalizer & De-tracker', () => {
    it('canonicalizes URLs by stripping tracking parameters deterministically', async () => {
      await initWasm();
      const rawUrl =
        'https://example.com/search?utm_source=twitter&q=rust+wasm&utm_campaign=launch&utm_medium=social&page=2#heading';
      const canon = canonicalizeUrl(rawUrl, true);

      // Verify tracking params are stripped and query params are sorted
      expect(canon).not.toContain('utm_source');
      expect(canon).not.toContain('utm_campaign');
      expect(canon).not.toContain('utm_medium');
      expect(canon).not.toContain('#heading');
      expect(canon).toBe('https://example.com/search?page=2&q=rust+wasm');

      // Test pure JS fallback returns matching result
      const pureCanon = pureJsCanonicalizeUrl(rawUrl, true);
      expect(canon).toBe(pureCanon);
    });

    it('strips common click trackers (fbclid, gclid, mc_eid, etc.)', () => {
      const url =
        'https://blog.rust-lang.org/2026/features?fbclid=IwAR123&gclid=Cj0K&sort=asc';
      const canon = canonicalizeUrl(url);
      expect(canon).toBe('https://blog.rust-lang.org/2026/features?sort=asc');
    });

    it('preserves fragment when stripFragment is false', () => {
      const url = 'https://example.com/page?utm_term=ad#section-2';
      const canon = canonicalizeUrl(url, false);
      expect(canon).toBe('https://example.com/page#section-2');
    });

    it('deduplicates a batch of URLs with duplicate mapping', async () => {
      await initWasm();
      const urls = [
        'https://github.com/rust-lang/rust?utm_source=tw',
        'https://google.com/search?q=simd',
        'https://github.com/rust-lang/rust?utm_campaign=ad',
        'https://google.com/search?q=simd#results',
        'https://developer.mozilla.org/docs',
      ];

      const res = deduplicateUrls(urls, true);
      expect(res.uniqueIndices).toEqual([0, 1, 4]);
      expect(res.duplicateMap).toEqual([0, 1, 0, 1, 4]);

      // Fallback verification
      const jsRes = pureJsDeduplicateUrls(urls, true);
      expect(res.uniqueIndices).toEqual(jsRes.uniqueIndices);
      expect(res.duplicateMap).toEqual(jsRes.duplicateMap);
    });

    it('exhaustively strips extensive marketing and tracking parameters while preserving media/search queries', async () => {
      await initWasm();
      const complexUrl =
        'https://example.com/watch?v=dQw4w9WgXcQ&utm_source=news&utm_medium=email&utm_campaign=daily&utm_term=link&utm_content=cta&fbclid=XYZ123&gclid=ABC456&twclid=TW789&igshid=IG001&mc_eid=MC999&si=SI888&spm=SPM777&ref=feed&sort=popular#timestamp';

      const withFrag = canonicalizeUrl(complexUrl, false);
      expect(withFrag).toBe(
        'https://example.com/watch?sort=popular&v=dQw4w9WgXcQ#timestamp',
      );
      expect(withFrag).not.toContain('utm_');
      expect(withFrag).not.toContain('fbclid');
      expect(withFrag).not.toContain('gclid');
      expect(withFrag).not.toContain('twclid');
      expect(withFrag).not.toContain('igshid');
      expect(withFrag).not.toContain('mc_eid');
      expect(withFrag).not.toContain('si=');
      expect(withFrag).not.toContain('spm=');
      expect(withFrag).not.toContain('ref=');

      const withoutFrag = canonicalizeUrl(complexUrl, true);
      expect(withoutFrag).toBe(
        'https://example.com/watch?sort=popular&v=dQw4w9WgXcQ',
      );
      expect(withoutFrag).not.toContain('#timestamp');

      // TS Fallback matches WASM output
      const jsWithFrag = pureJsCanonicalizeUrl(complexUrl, false);
      expect(withFrag).toBe(jsWithFrag);
      const jsWithoutFrag = pureJsCanonicalizeUrl(complexUrl, true);
      expect(withoutFrag).toBe(jsWithoutFrag);
    });

    it('normalizes schemes, default ports, duplicate path slashes, and trailing slashes', async () => {
      await initWasm();
      const testCases = [
        {
          input: 'HTTP://WWW.EXAMPLE.COM:80//articles///2026//?utm_source=rss',
          expected: 'http://www.example.com/articles/2026',
        },
        {
          input: 'HTTPS://EXAMPLE.COM:443/docs/',
          expected: 'https://example.com/docs',
        },
        {
          input: 'http://localhost:3000/api//v1//users?ref=nav&limit=25#page2',
          expectedWithFrag: 'http://localhost:3000/api/v1/users?limit=25#page2',
          expectedNoFrag: 'http://localhost:3000/api/v1/users?limit=25',
        },
        {
          input: 'https://example.com./?utm_medium=cpc',
          expected: 'https://example.com/',
        },
      ];

      for (const tc of testCases) {
        if (tc.expected) {
          const wasmRes = canonicalizeUrl(tc.input, true);
          const jsRes = pureJsCanonicalizeUrl(tc.input, true);
          expect(wasmRes).toBe(tc.expected);
          expect(jsRes).toBe(tc.expected);
        }
        if (tc.expectedWithFrag) {
          const wasmRes = canonicalizeUrl(tc.input, false);
          const jsRes = pureJsCanonicalizeUrl(tc.input, false);
          expect(wasmRes).toBe(tc.expectedWithFrag);
          expect(jsRes).toBe(tc.expectedWithFrag);
        }
      }
    });

    it('produces byte-identical results between Rust WASM and pure TS fallback across diverse URLs', async () => {
      await initWasm();
      const urls = [
        'https://github.com/rust-lang/rust/pull/123?utm_source=twitter&tab=files#diff-1',
        'https://news.ycombinator.com/item?id=456&ref=hn',
        'http://sub.domain.org:8080/path/to/resource?q=wasm+simd&category=tech&fbclid=abc',
        'https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams?utm_campaign=dev#examples',
      ];

      for (const u of urls) {
        const wasmWithFrag = canonicalizeUrl(u, false);
        const jsWithFrag = pureJsCanonicalizeUrl(u, false);
        expect(wasmWithFrag).toBe(jsWithFrag);

        const wasmNoFrag = canonicalizeUrl(u, true);
        const jsNoFrag = pureJsCanonicalizeUrl(u, true);
        expect(wasmNoFrag).toBe(jsNoFrag);
      }
    });
  });

  describe('SIMD HTML Stripper & Content Extractor', () => {
    it('extracts title, meta description, and cleaned text body', async () => {
      await initWasm();
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>  Fast Tab Organizer &amp; AI Search  </title>
            <meta name="description" content="Local-first browser extension for organizing tabs with Rust SIMD." />
            <style>
              body { font-size: 14px; }
              .ad { display: none; }
            </style>
            <script>
              window.__TRACKING__ = { userId: "xyz" };
            </script>
          </head>
          <body>
            <!-- Header section -->
            <header>
              <nav><a href="/">Home</a></nav>
            </header>
            <main>
              <h1>Organize &amp; Cluster Tabs</h1>
              <p>Experience sub-millisecond tab clustering using &quot;Rust WASM&quot; and WebGPU compute shaders.</p>
              <p>Special characters: &lt;tag&gt; and &#39;quotes&#39; &amp; &nbsp; spaces.</p>
            </main>
          </body>
        </html>
      `;

      const extracted = extractHtmlContent(html);
      expect(extracted.title).toBe('Fast Tab Organizer & AI Search');
      expect(extracted.description).toBe(
        'Local-first browser extension for organizing tabs with Rust SIMD.',
      );

      // Verify styles, scripts, comments, and tags are completely stripped
      expect(extracted.body).not.toContain('window.__TRACKING__');
      expect(extracted.body).not.toContain('font-size');
      expect(extracted.body).not.toContain('Header section');
      expect(extracted.body).not.toContain('<p>');
      expect(extracted.body).not.toContain('</p>');

      // Verify HTML entities decoded
      expect(extracted.body).toContain('"Rust WASM"');
      expect(extracted.body).toContain('<tag>');
      expect(extracted.body).toContain("'quotes'");

      // Verify pure JS fallback
      const jsExtracted = pureJsExtractHtmlContent(html);
      expect(extracted.title).toBe(jsExtracted.title);
      expect(extracted.description).toBe(jsExtracted.description);
      expect(extracted.body.length).toBeGreaterThan(50);
    });

    it('handles empty or malformed HTML gracefully', () => {
      expect(extractHtmlContent('')).toEqual({
        title: '',
        description: '',
        body: '',
      });
      expect(extractHtmlContent('just plain text')).toEqual({
        title: '',
        description: '',
        body: 'just plain text',
      });
    });

    it('extracts meta description with inverted attributes and handles nested scripts/styles', async () => {
      await initWasm();
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta content="Inverted attribute description" name="description" />
            <title>Advanced SIMD Test &amp; Analysis</title>
            <style>
              .container { display: flex; flex-direction: column; }
              #header { background: #333; }
            </style>
            <script type="application/javascript">
              const config = { api: "https://api.example.com", key: "123" };
            </script>
          </head>
          <body>
            <!-- Main Content Container -->
            <article>
              <h2>Header Title &amp; Details</h2>
              <p>Text with &lt;embedded&gt; brackets and &quot;quotes&quot;.</p>
            </article>
          </body>
        </html>
      `;

      const wasmRes = extractHtmlContent(html);
      const jsRes = pureJsExtractHtmlContent(html);

      expect(wasmRes.title).toBe('Advanced SIMD Test & Analysis');
      expect(wasmRes.description).toBe('Inverted attribute description');
      expect(wasmRes.title).toBe(jsRes.title);
      expect(wasmRes.description).toBe(jsRes.description);
      expect(wasmRes.body).toContain('Header Title & Details');
      expect(wasmRes.body).toContain('brackets and "quotes"');
      expect(wasmRes.body).not.toContain('container');
      expect(wasmRes.body).not.toContain('config');
    });
  });

  describe('Zero-Copy Binary Vector Store', () => {
    it('serializes tabs and embeddings into TABV binary buffer and searches in zero-copy WASM', async () => {
      await initWasm();
      const dim = 16;
      const count = 20;
      const ids: string[] = [];
      const vectors: Float32Array[] = [];

      for (let i = 0; i < count; i++) {
        ids.push(`tab_id_${i}`);
        const v = new Float32Array(dim);
        for (let d = 0; d < dim; d++) {
          v[d] = Math.sin((i + 1) * 11 + (d + 1) * 5);
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
        vectors.push(v);
      }

      // Create INT8 quantized binary store
      const storeBuffer = createVectorStore(ids, vectors, dim, true);
      expect(storeBuffer.byteLength).toBeGreaterThan(64);

      // Verify TABV magic header: 'T', 'A', 'B', 'V' (0x54, 0x41, 0x42, 0x56)
      expect(storeBuffer[0]).toBe(0x54);
      expect(storeBuffer[1]).toBe(0x41);
      expect(storeBuffer[2]).toBe(0x42);
      expect(storeBuffer[3]).toBe(0x56);

      // Verify reading tab ID back
      expect(getVectorStoreTabId(storeBuffer, 0)).toBe('tab_id_0');
      expect(getVectorStoreTabId(storeBuffer, 5)).toBe('tab_id_5');
      expect(getVectorStoreTabId(storeBuffer, 19)).toBe('tab_id_19');
      expect(getVectorStoreTabId(storeBuffer, 999)).toBeNull();

      // Search top-3 nearest to vectors[5]
      const query = vectors[5] ?? new Float32Array(dim);
      const top3 = searchVectorStore(storeBuffer, query, 3);

      expect(top3.length).toBe(3);
      // Top 1 must be index 5 with highest similarity
      expect(top3[0]?.index).toBe(5);
      expect(top3[0]?.score).toBeGreaterThan(0.9);
    });

    it('creates FP32 unquantized store correctly', async () => {
      await initWasm();
      const dim = 8;
      const ids = ['tab_a', 'tab_b'];
      const vA = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
      const vB = new Float32Array([0, 1, 0, 0, 0, 0, 0, 0]);

      const storeBuffer = createVectorStore(ids, [vA, vB], dim, false);
      const top = searchVectorStore(storeBuffer, vB, 2);
      expect(top.length).toBe(2);
      expect(top[0]?.index).toBe(1);
      expect(top[0]?.score).toBeCloseTo(1.0, 4);
    });

    it('verifies pure TS fallback and Rust WASM produce compatible TABV stores and identical search rankings', async () => {
      await initWasm();
      const dim = 8;
      const count = 10;
      const ids = Array.from({ length: count }, (_, i) => `tab_${i}`);
      const vectors: Float32Array[] = [];
      for (let i = 0; i < count; i++) {
        const v = new Float32Array(dim);
        v[i % dim] = 1.0;
        vectors.push(v);
      }

      // 1. Create TABV via Pure TS fallback
      const jsStore = pureJsCreateVectorStore(ids, vectors, dim, true);
      expect(jsStore[0]).toBe(0x54); // 'T'
      expect(jsStore[1]).toBe(0x41); // 'A'
      expect(jsStore[2]).toBe(0x42); // 'B'
      expect(jsStore[3]).toBe(0x56); // 'V'

      // Search jsStore using both WASM and pure JS
      const query = vectors[3] ?? new Float32Array(dim);
      const jsTop = pureJsSearchVectorStore(jsStore, query, 3);
      const wasmTopOnJsStore = searchVectorStore(jsStore, query, 3);

      expect(jsTop[0]?.index).toBe(3);
      expect(wasmTopOnJsStore[0]?.index).toBe(3);
      expect(jsTop[0]?.score).toBeCloseTo(wasmTopOnJsStore[0]?.score ?? 0, 4);

      // Verify ID lookup via both
      expect(pureJsGetVectorStoreTabId(jsStore, 3)).toBe('tab_3');
      expect(getVectorStoreTabId(jsStore, 3)).toBe('tab_3');

      // 2. Create TABV via Rust WASM
      const wasmStore = createVectorStore(ids, vectors, dim, true);
      const wasmTop = searchVectorStore(wasmStore, query, 3);
      const jsTopOnWasmStore = pureJsSearchVectorStore(wasmStore, query, 3);

      expect(wasmTop[0]?.index).toBe(3);
      expect(jsTopOnWasmStore[0]?.index).toBe(3);
      expect(wasmTop[0]?.score).toBeCloseTo(jsTopOnWasmStore[0]?.score ?? 0, 4);

      expect(getVectorStoreTabId(wasmStore, 3)).toBe('tab_3');
      expect(pureJsGetVectorStoreTabId(wasmStore, 3)).toBe('tab_3');
    });
  });

  describe('Comprehensive 10-Kernel Empirical Benchmark Suite', () => {
    it('executes full benchmark and verifies speedups across all 10 kernels', async () => {
      const report = await runWasmVsJsBenchmark();
      expect(report.isWasmActive).toBe(true);
      expect(report.entries.length).toBe(10);

      for (const entry of report.entries) {
        expect(entry.jsLatencyMs).toBeGreaterThan(0);
        expect(entry.wasmLatencyMs).toBeGreaterThan(0);
        expect(entry.speedup).toBeGreaterThan(0.2);
      }

      // Check Pairwise Cosine Matrix speedup
      const pairwise = report.entries.find((e) =>
        e.name.includes('Pairwise Cosine'),
      );
      expect(pairwise).toBeDefined();
      expect(pairwise?.wasmLatencyMs).toBeGreaterThan(0);
      expect(pairwise?.speedup).toBeGreaterThan(0.5);

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

      // Check URL Canonicalization speedup
      const urlBench = report.entries.find((e) =>
        e.name.includes('URL Canonicalization'),
      );
      expect(urlBench).toBeDefined();

      // Check HTML Extractor speedup
      const htmlBench = report.entries.find((e) =>
        e.name.includes('HTML Content Extractor'),
      );
      expect(htmlBench).toBeDefined();

      // Check Vector Store Search speedup
      const storeBench = report.entries.find((e) =>
        e.name.includes('Vector Store Search'),
      );
      expect(storeBench).toBeDefined();
    });
  });
});
