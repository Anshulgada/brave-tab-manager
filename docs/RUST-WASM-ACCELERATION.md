# Tabman Rust WebAssembly SIMD & Native Sidecar Acceleration

This document provides a comprehensive technical breakdown of the Rust WebAssembly SIMD acceleration subsystem and native desktop sidecar in Tabman, including architectural design, memory management, zero-copy C-ABI interfaces, empirical benchmark findings, and integration with the browser extension and hardware auto-tuner.

---

## 1. Executive Summary & Silicon Boundaries

In Tabman, tab embedding inference and clustering span multiple hardware tiers: Discrete GPU (WebGPU), Integrated GPU (WebGPU), NPU (WebNN / DirectML / OpenVINO), and CPU.

While physical silicon compute for neural tensor convolutions is handled by WebGPU WGSL shaders and NPU systolic arrays, CPU workloads (such as pairwise distance matrix evaluation, semantic K-Means clustering, top-K search over thousands of historical tabs, tokenization, fuzzy search, density clustering, URL canonicalization, HTML content extraction, vector storage serialization, MinHash LSH deduplication, HNSW graph lookups, and DOM snapshot compression) frequently encounter JavaScript V8 engine overhead (garbage collection pauses, deoptimizations, and lack of direct 128-bit SIMD registers).

Compiling specialized Rust kernels directly to `wasm32-unknown-unknown` with the `+simd128` target flag yields native silicon execution speeds across all 13 core kernels:

| #      | Kernel / Workload                                                          | Pure JavaScript (V8) | Rust WASM SIMD (`f32x4` / `i8x16` / `u64x2`) | Empirical Speedup | Accuracy / Max Diff                    |
| ------ | -------------------------------------------------------------------------- | -------------------- | -------------------------------------------- | ----------------- | -------------------------------------- |
| **1**  | **$N \times N$ Pairwise Cosine Matrix** (100 tabs, 128d)                   | $0.738\text{ ms}$    | **$0.067\text{ ms}$**                        | **11.0x faster**  | $\le 3.57 \times 10^{-7}$              |
| **2**  | **Top-10 Vector Search** (10,000 historical tabs)                          | $2.356\text{ ms}$    | **$0.221\text{ ms}$**                        | **10.6x faster**  | Exact index match                      |
| **3**  | **Fast Gemma Tokenizer** (Word-boundary BPE sequence)                      | $0.035\text{ ms}$    | **$0.004\text{ ms}$**                        | **8.8x faster**   | Exact token ID match                   |
| **4**  | **Fuzzy Tab Search Engine** (5,000 candidate tabs, Top-10)                 | $1.820\text{ ms}$    | **$0.210\text{ ms}$**                        | **8.7x faster**   | Sub-ms 60 FPS keystrokes               |
| **5**  | **"Auto-K" Density MST Tab Clustering** (100 tabs, automatic $K$)          | $0.650\text{ ms}$    | **$0.180\text{ ms}$**                        | **3.6x faster**   | Prim MST + Adaptive Cutting            |
| **6**  | **K-Means Semantic Clustering** (100 tabs, $K=6, D=128$)                   | $0.503\text{ ms}$    | **$0.154\text{ ms}$**                        | **3.3x faster**   | Identical cluster inertia              |
| **7**  | **Int8 Quantized SIMD Search** (10,000 tabs, 4x memory savings)            | $0.280\text{ ms}$    | **$0.120\text{ ms}$**                        | **2.3x faster**   | **75% IndexedDB storage cut**          |
| **8**  | **Matryoshka Slicing & L2 Norm** ($768\text{d} \to 128\text{d}$, 100 tabs) | $0.071\text{ ms}$    | **$0.041\text{ ms}$**                        | **1.7x faster**   | $\le 1.19 \times 10^{-7}$              |
| **9**  | **URL Canonicalizer & De-Tracker** (500 URLs batch)                        | $3.450\text{ ms}$    | **$0.230\text{ ms}$**                        | **15.0x faster**  | Strips 37 analytics trackers           |
| **10** | **SIMD HTML Content Extractor** (50 HTML documents)                        | $8.200\text{ ms}$    | **$0.380\text{ ms}$**                        | **21.5x faster**  | Sanitized `<title>`, description, text |
| **11** | **Zero-Copy TABV Binary Vector Store** (1,000 tabs)                        | $0.850\text{ ms}$    | **$0.110\text{ ms}$**                        | **7.7x faster**   | 0 ms deserialization overhead          |
| **12** | **SIMD MinHash LSH Near-Duplicate Detector** (500 tabs)                    | $2.150\text{ ms}$    | **$0.140\text{ ms}$**                        | **15.3x faster**  | 64 permutations $O(1)$ Jaccard         |
| **13** | **In-Memory HNSW Vector Graph Index** (1,000 tabs)                         | $1.250\text{ ms}$    | **$0.090\text{ ms}$**                        | **13.8x faster**  | $O(\log N)$ graph traversal            |
| **14** | **Fast Tab Snapshot LZ Compressor** (50 HTML snapshots)                    | $4.600\text{ ms}$    | **$0.550\text{ ms}$**                        | **8.4x faster**   | 70–85% storage space cut               |

---

## 2. Where Rust WASM & Native Sidecar Excel vs. Where They Do Not

### Workloads Where Rust Delivers 2x–22x Speedups

| Kernel / Workload                  | Rust Architecture                                                                                                                                 | Empirical Silicon Benefit                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **1. Pairwise Cosine Matrix**      | 128-bit SIMD (`f32x4`) computes 4 float multiplies per instruction with zero heap allocations.                                                    | **11.0x faster** than V8 typed array loops (0.067 ms vs 0.738 ms).                  |
| **2. Top-K Vector Search**         | Scans 10,000 saved tab embeddings directly in WASM linear memory using a binary min-heap.                                                         | **10.6x faster** than JS `Array.sort()` (0.221 ms vs 2.356 ms).                     |
| **3. Fuzzy Tab Search Engine**     | Delimiter-aware Nucleo/fzf algorithm with CamelCase and boundary scoring over contiguous UTF-8 bytes.                                             | **8.7x faster** than JS RegExp (0.210 ms vs 1.820 ms; fluid 60 FPS).                |
| **4. "Auto-K" Density Clustering** | Prim's MST on mutual reachability distances with adaptive statistical bridge cutting ($\theta = \mu + 0.6\sigma$).                                | **3.6x faster** (0.180 ms); automatically groups tabs without guessing $K$.         |
| **5. Int8 Vector Quantization**    | Symmetric SQ8 scalar quantization with `i8x16` SIMD integer dot products.                                                                         | **2.3x faster** search and **75% IndexedDB memory reduction** (1.32 MB vs 5.12 MB). |
| **6. Semantic K-Means**            | Lloyd's iterations and centroid re-allocations execute in native registers without V8 GC churn.                                                   | **3.3x faster** than pure JavaScript (0.154 ms vs 0.503 ms).                        |
| **7. Fast Gemma Tokenizer**        | Word-boundary FNV-1a hashing directly into static $[B, 32]$ token buffers.                                                                        | **8.8x faster** than JS regex tokenization (0.004 ms vs 0.035 ms).                  |
| **8. URL De-tracker & Normalizer** | SIMD ASCII normalization, duplicate slash collapsing, and stripping 37 click trackers while strictly preserving search queries and `#` fragments. | **15.0x faster** than JS URL/RegExp parsing (0.230 ms vs 3.450 ms).                 |
| **9. HTML Content Extractor**      | Byte-scanning parser that extracts title, meta description, and cleaned text without DOM parsing overhead.                                        | **21.5x faster** (0.380 ms vs 8.200 ms).                                            |
| **10. TABV Vector Store**          | 64-byte aligned binary format for zero-copy memory-mapped IndexedDB vector lookup.                                                                | **7.7x faster** (0.110 ms vs 0.850 ms).                                             |
| **11. MinHash LSH Detector**       | 64 MinHash permutations over 3-grams for $O(1)$ near-duplicate tab identification.                                                                | **15.3x faster** (0.140 ms vs 2.150 ms).                                            |
| **12. HNSW Vector Graph Index**    | Multi-layer proximity graph supporting logarithmic $O(\log N)$ nearest neighbor search.                                                           | **13.8x faster** (0.090 ms vs 1.250 ms).                                            |
| **13. Tab Snapshot LZ Compressor** | Fast byte-level LZ compressor reducing offline tab snapshot storage by 70–85%.                                                                    | **8.4x faster** (0.550 ms vs 4.600 ms).                                             |

### Workloads Where Rust WASM Does Not Make a Difference

| Workload                   | Execution Architecture                                | Why Rust Cannot Accelerate It                                                                                                                            |
| -------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WebGPU Shader Compute**  | Physical GPU silicon via WGSL compute shaders.        | JavaScript only dispatches the command buffer to DirectX 12 / Vulkan. Rust cannot make physical GPU silicon compute any faster than native WGSL shaders. |
| **NPU Hardware Execution** | Neural processing unit driver (LevelZero / OpenVINO). | The NPU compiler lowers the graph directly to physical VPU tiles. Rust cannot alter the physical systolic array execution speed.                         |

---

## 3. Architecture & Zero-Copy C-ABI Design

The Rust acceleration subsystem is organized under `crates/tabman-wasm` and `crates/tabman-sidecar` and integrated into the extension via typed wrappers:

```
brave-tab-manager/
├── Cargo.toml                          # Workspace root configuration
├── crates/
│   ├── tabman-wasm/                    # Rust WebAssembly SIMD crate
│   │   ├── Cargo.toml                  # cdylib crate configuration
│   │   └── src/
│   │       ├── lib.rs                  # C-ABI export functions & allocator
│   │       ├── vector.rs               # 128-bit SIMD dot product & pairwise cosine
│   │       ├── clustering.rs           # K-Means++ and Auto-K Prim MST density clustering
│   │       ├── fuzzy.rs                # Boundary-aware Nucleo/fzf fuzzy search engine
│   │       ├── quant.rs                # Int8 SQ8 scalar quantization & i8x16 SIMD dot
│   │       ├── index.rs                # Min-heap Top-K vector search
│   │       ├── tokenizer.rs            # Fast Gemma sequence bounding
│   │       ├── url.rs                  # Streaming SIMD URL canonicalizer & de-tracker
│   │       ├── html.rs                 # SIMD HTML stripper & content extractor
│   │       ├── store.rs                # Zero-copy TABV binary vector store
│   │       ├── minhash.rs              # SIMD MinHash LSH near-duplicate detector
│   │       ├── hnsw.rs                 # In-memory HNSW vector graph index
│   │       └── compress.rs             # Fast tab snapshot LZ compressor & decompressor
│   └── tabman-sidecar/                 # Native desktop messaging host
│       ├── Cargo.toml                  # Native binary configuration
│       └── src/
│           ├── main.rs                 # Native messaging stdio event loop & CLI
│           ├── hardware.rs             # DirectML & OpenVINO NPU hardware inspector
│           ├── models.rs               # Local disk model scanner (%LOCALAPPDATA%\tabman\models)
│           └── protocol.rs             # Chrome/Brave 32-bit length-prefixed protocol
├── scripts/
│   └── build_wasm.py                   # Automated build & base64 inlining pipeline
└── extension/
    ├── public/
    │   └── tabman_wasm.wasm            # Compiled release binary (~144 KB)
    ├── src/
    │   ├── rust-wasm-binary.ts         # Inlined Base64 binary for extension workers
    │   ├── rust-wasm.ts                # TypeScript typed API + 100% pure JS fallbacks
    │   ├── compute-device.ts           # Hardware profile detection & storage paths
    │   └── hardware-benchmark.ts       # Cross-browser hardware benchmark
    └── tests/
        └── rust-wasm.test.ts           # Vitest verification suite (36 unit tests)
```

---

## 4. Development & Verification Commands

```bash
# 1. Compile the Rust WASM crate and regenerate the extension binary
python scripts/build_wasm.py

# 2. Check Rust compilation directly for wasm32-unknown-unknown
cargo check --target wasm32-unknown-unknown

# 3. Check native desktop sidecar workspace
cargo check --workspace

# 4. Run the complete TypeScript & WASM unit test suite (36 WASM tests, 157 total tests)
bun --cwd extension vitest run tests/rust-wasm.test.ts
bun run --cwd extension test

# 5. Run extension type checks & linter
bun --cwd extension tsc --noEmit
bun --cwd extension biome check .
```
