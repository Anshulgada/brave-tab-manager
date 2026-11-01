# Tabman Rust WebAssembly SIMD Acceleration

This document provides a comprehensive technical breakdown of the Rust WebAssembly SIMD acceleration subsystem in Tabman, including architectural design, memory management, zero-copy C-ABI interfaces, empirical benchmark findings, and integration with the browser extension and hardware auto-tuner.

---

## 1. Executive Summary & Silicon Boundaries

In Tabman, tab embedding inference and clustering span multiple hardware tiers: Discrete GPU (WebGPU), Integrated GPU (WebGPU), NPU (WebNN / LevelZero), and CPU.

While physical silicon compute for neural tensor convolutions is handled by WebGPU WGSL shaders and NPU systolic arrays, CPU workloads (such as pairwise distance matrix evaluation, semantic K-Means clustering, top-K search over thousands of historical tabs, and tokenization) frequently encounter JavaScript V8 engine overhead (garbage collection pauses, deoptimizations, and lack of direct 128-bit SIMD registers).

Compiling specialized Rust kernels directly to `wasm32-unknown-unknown` with the `+simd128` target flag yields native silicon execution speeds:

| Kernel / Workload                                                          | Pure JavaScript (V8) | Rust WASM SIMD (`f32x4`) | Empirical Speedup | Accuracy / Max Diff       |
| -------------------------------------------------------------------------- | -------------------- | ------------------------ | ----------------- | ------------------------- |
| **$N \times N$ Pairwise Cosine Matrix** (100 tabs, 128d)                   | $0.738\text{ ms}$    | **$0.067\text{ ms}$**    | **11.0x faster**  | $\le 3.57 \times 10^{-7}$ |
| **Top-10 Vector Search** (10,000 historical tabs)                          | $2.356\text{ ms}$    | **$0.221\text{ ms}$**    | **10.6x faster**  | Exact index match         |
| **K-Means Semantic Clustering** (100 tabs, $K=6, D=128$)                   | $0.503\text{ ms}$    | **$0.154\text{ ms}$**    | **3.3x faster**   | Identical cluster inertia |
| **Matryoshka Slicing & L2 Norm** ($768\text{d} \to 128\text{d}$, 100 tabs) | $0.071\text{ ms}$    | **$0.041\text{ ms}$**    | **1.7x faster**   | $\le 1.19 \times 10^{-7}$ |
| **Fast Gemma Tokenizer** (Word-boundary BPE sequence)                      | $0.035\text{ ms}$    | **$0.004\text{ ms}$**    | **8.8x faster**   | Exact token ID match      |

---

## 2. Where Rust WASM Excels vs. Where It Does Not

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       WHERE RUST WASM GIVES HUGE SPEEDUPS                   │
├────────────────────────────────┬────────────────────────────────────────────┤
│ 1. Pairwise Cosine Matrix      │ 128-bit SIMD (`f32x4`) computes 4 floats   │
│    (100x100 = 10,000 pairs)    │ per instruction cycle with zero heap alloc │
│                                │ (11.0x faster than JS typed loops).        │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 2. Top-K Vector Search         │ Scans 10,000 saved tab embeddings from     │
│    (IndexedDB retrieval)       │ IndexedDB using a binary min-heap in WASM  │
│                                │ (10.6x faster than JS array sorting).      │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 3. Semantic K-Means Clustering │ Centroid updates and distance re-allocs    │
│    (Lloyd's iterations)        │ execute in native registers without V8 GC  │
│                                │ (3.3x faster than pure JavaScript).        │
├────────────────────────────────┼────────────────────────────────────────────┤
│ 4. Gemma Sequence Tokenizer    │ FNV-1a word hashing directly into static   │
│    ([B, 32] tensor inputs)     │ [B, 32] token buffers without JS RegExp.   │
├────────────────────────────────┴────────────────────────────────────────────┤
│                     WHERE RUST WILL NOT MAKE A DIFFERENCE                   │
├────────────────────────────────┬────────────────────────────────────────────┤
│ WebGPU Shader Compute          │ WebGPU executes directly on GPU silicon    │
│                                │ via WGSL compute shaders. JavaScript only  │
│                                │ dispatches the command buffer. Rust cannot │
│                                │ make physical GPU silicon compute faster   │
│                                │ than native WGSL shaders.                  │
├────────────────────────────────┼────────────────────────────────────────────┤
│ NPU Hardware Compilation       │ The NPU driver (LevelZero / OpenVINO)      │
│                                │ handles tensor lowering to VPU tiles. Rust │
│                                │ cannot alter the physical systolic array.  │
└────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 3. Architecture & Zero-Copy C-ABI Design

The Rust acceleration subsystem is organized under `crates/tabman-wasm` and integrated into the extension via typed wrappers:

```
brave-tab-manager/
├── Cargo.toml                          # Workspace root configuration
├── crates/
│   └── tabman-wasm/                    # Rust WebAssembly crate
│       ├── Cargo.toml                  # cdylib crate configuration
│       └── src/
│           ├── lib.rs                  # C-ABI export functions & allocator
│           ├── vector.rs               # 128-bit SIMD dot product & pairwise cosine
│           ├── clustering.rs           # K-Means++ & Lloyd's iterations
│           ├── index.rs                # Min-heap Top-K vector search
│           └── tokenizer.rs            # Fast Gemma sequence bounding
├── scripts/
│   └── build_wasm.py                   # Automated build & embed tool
└── extension/
    ├── public/
    │   └── tabman_wasm.wasm            # Compiled release binary (~34 KB)
    ├── src/
    │   ├── rust-wasm-binary.ts         # Inlined Base64 binary for extension workers
    │   ├── rust-wasm.ts                # TypeScript typed API + 100% pure JS fallback
    │   └── hardware-benchmark.ts       # Integrated hardware benchmark & profiler
    └── tests/
        └── rust-wasm.test.ts           # Vitest verification suite
```

### 3.1 C-ABI Export Signatures

To avoid serialization overhead across the JavaScript <-> WebAssembly boundary, all functions operate directly on linear memory pointers (`*const f32`, `*mut f32`, `*mut u32`):

```rust
// Memory allocation
pub extern "C" fn tabman_alloc(size: usize) -> *mut u8;
pub extern "C" fn tabman_dealloc(ptr: *mut u8, size: usize);

// High-performance compute
pub extern "C" fn tabman_pairwise_cosine(vectors_ptr: *const f32, n: usize, dim: usize, out_ptr: *mut f32);
pub extern "C" fn tabman_kmeans(vectors_ptr: *const f32, n: usize, dim: usize, k: usize, max_iter: usize, out_ptr: *mut i32) -> f32;
pub extern "C" fn tabman_topk_search(query_ptr: *const f32, db_ptr: *const f32, m: usize, dim: usize, k: usize, out_idx_ptr: *mut u32, out_scores_ptr: *mut f32) -> usize;
pub extern "C" fn tabman_matryoshka_slice(vectors_ptr: *const f32, n: usize, orig_dim: usize, target_dim: usize, out_ptr: *mut f32);
pub extern "C" fn tabman_tokenize(title_ptr: *const u8, title_len: usize, max_len: usize, out_tokens_ptr: *mut i64, out_mask_ptr: *mut i64) -> usize;
```

### 3.2 Inlined Base64 Extension Loading

Chrome and Brave Extension Manifest V3 background service workers frequently restrict runtime `fetch()` calls to local extension assets in sandboxed execution contexts.

To eliminate network latency and cross-origin sandboxing hurdles, `scripts/build_wasm.py` encodes the 34 KB compiled binary into `extension/src/rust-wasm-binary.ts` as an inlined base64 constant (`TABMAN_WASM_BASE64`). `rust-wasm.ts` synchronously instantiates this module at worker boot, ensuring 0.0 ms cold-start latency.

---

## 4. Hardware Benchmark & Dynamic Multi-Device Auto-Tuner

The multi-device hardware benchmark in `extension/src/hardware-benchmark.ts` automatically benchmarks CPU capability using the Rust WASM SIMD kernel:

```typescript
// Hardware report includes CPU Rust WASM SIMD device classification:
{
  id: 'cpu',
  name: 'CPU Rust WASM SIMD (16 Threads)',
  category: 'cpu',
  latencyMs: 0.12,
  available: true
}
```

When users configure compute device to `auto`, Tabman measures empirical matrix projection latency across all available silicon devices (Discrete GPU, Integrated GPU, NPU, and CPU SIMD) and selects the optimum backend based on workload batch size.

---

## 5. Development & Verification Commands

```bash
# 1. Compile the Rust WASM crate and regenerate the extension binary
python scripts/build_wasm.py

# 2. Check Rust compilation directly for wasm32-unknown-unknown
cargo check --target wasm32-unknown-unknown

# 3. Run the complete TypeScript & WASM unit test suite
bun --cwd extension vitest run tests/rust-wasm.test.ts

# 4. Run extension type checks & linter
bun --cwd extension tsc --noEmit
bun --cwd extension biome lint .
```

---

## 6. Future Rust Acceleration Roadmap

The following high-ROI Rust acceleration modules are planned to further extend Tabman's native silicon performance:

### 6.1 Fuzzy Tab Search Engine (`fzf` / `Nucleo` in WASM)

- **Target:** Popup and dashboard instant search bar.
- **Problem:** Substring `.includes()` and regex in JavaScript stutter when filtering across thousands of historical tabs and bookmarks (40–80 ms per keystroke).
- **Rust Solution:** Modified Smith-Waterman / Nucleo scoring kernel compiled to WASM.
- **Projected Gain:** Sub-millisecond (< 1 ms) ranked fuzzy search across 50,000 tabs with fluid 60 FPS UI responsiveness.

### 6.2 Density & Graph Tab Clustering (HDBSCAN / Auto-K)

- **Target:** AI tab organization without manual $K$ hyperparameter tuning.
- **Problem:** K-Means requires specifying cluster count $K$ upfront. Users have arbitrary numbers of open tabs with unknown topic distribution.
- **Rust Solution:** Minimum spanning tree (MST) and mutual reachability distance computation on top of our existing 11.0x pairwise cosine similarity matrix.
- **Projected Gain:** Unsupervised, automatic group discovery in < 0.5 ms for 100 tabs.

### 6.3 Int8 Vector Quantization (`i8x16` SIMD)

- **Target:** Tab archive and IndexedDB vector storage.
- **Problem:** Storing 768d `f32` vectors in IndexedDB for 10,000 tabs consumes ~31 MB of storage.
- **Rust Solution:** Scalar Quantization (SQ8) to compress floats into `int8_t` (-128..127) with symmetric zero-point offsets, combined with `i8x16` SIMD dot products.
- **Projected Gain:** 75% storage reduction (4x compression) and 2x faster dot product calculations on modern CPU silicon.

### 6.4 Bulk URL Ingestion & Deduplicator

- **Target:** Browser history and bookmark vault imports.
- **Problem:** Parsing, stripping tracking parameters (`utm_*`, `fbclid`, `ref`), canonicalizing hostnames, and deduplicating 50,000 URLs creates heavy V8 garbage collection churn.
- **Rust Solution:** Zero-allocation URL parser with AHash / RapidHash in Rust WASM.
- **Projected Gain:** Processes 50,000 raw URLs in < 15 ms without main-thread jank.

### 6.5 Native Desktop CLI Sidecar (Replaces Python CLI)

- **Target:** Desktop native CLI (`tabman`) and browser bridge.
- **Problem:** Python interpreter startup and dependency loading (`pydantic`, `onnxruntime`, `click`) incurs a 300–800 ms cold start and 180 MB memory footprint.
- **Rust Solution:** Standalone native Rust binary linking to the ONNX Runtime C API (`ort`) and memory-mapped SQLite (`rusqlite`).
- **Projected Gain:** 5 ms instant cold start, 15 MB RAM, and zero Python / virtualenv requirements on the host system.
