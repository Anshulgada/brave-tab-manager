# Tabman

A local-first tab switchboard, intelligent collection library, and AI organizer for Brave and other Chromium browsers, with a companion Python CLI vault and Rust WebAssembly acceleration.

Tabman has two tightly integrated surfaces:

- **Browser Extension (Dashboard & Side Panel)** — A high-performance WXT + React + Framer Motion dashboard and side panel for finding, grouping, previewing, discarding, closing, parking, and restoring tabs. Data stays private in IndexedDB.
- **CLI Vault** — A Python 3.14 command-line vault for importing, searching, organizing, and exporting tab collections as SQLite, JSON, or Markdown.

No account, cloud service, or external AI provider is required for the core workflow.

---

## What's New in v0.6.7

The `0.6.7` release brings a complete overhaul to the design system, micro-interactions, rich previews, local AI engine, and testing pipelines:

- **Modern Design System & Micro-Interactions:** Fully unified atomic component primitives built on Radix UI, CVA, and Tailwind tokens with zero design drift. Features Framer Motion spring physics on button presses (`whileTap`), link hover glides, `<AnimatePresence>` panel transitions, and `<AnimatedTabs>` sliding pill switchers across all views.
- **Rich Visual Link Previews:** Raindrop.io-style visual cards with responsive thumbnail covers, descriptions, and favicons powered by optional Iframely integration and local IndexedDB preview caching.
- **Local AI Embedding Engine (EmbeddingGemma 2):** Zero-cloud semantic categorization using fine-tuned `EmbeddingGemma 2` backbones (270M, 440M, 740M INT8 ONNX) running natively on WebGPU, DirectML, and Neural Processing Units (NPU).
- **Rust WebAssembly SIMD Acceleration:** 13 native Silicon kernels delivering up to 21.5x speedups for vector search, fuzzy matching, pairwise cosine distance, Prim's MST clustering, MinHash LSH, and LZ compression.
- **Switchboard & Side Panel:** Instant multi-window tab management, real-time search, deduplication, audio/sleep badges, and 1-click window parking.
- **Dynamic Versioning & Instant Push:** Project versions are dynamically derived from configuration metadata (`pyproject.toml` and `package.json`), with all test and build gates running via pre-commit path filtering (`scripts/ci_gates.py`) so `git push` is always clean, fast, and unblocked.

---

## Installation

### 1. Browser Extension

#### From a GitHub Release

Run in Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install-extension.ps1 | iex
```

Or on macOS/Linux:

```sh
curl -LsSf https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install-extension.sh | sh
```

Then:

1. Open `brave://extensions` (or `chrome://extensions`).
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the unpacked folder printed by the installer (`%LOCALAPPDATA%\Tabman\extension-latest` on Windows, or `~/.local/share/tabman/extension-latest` on Linux/macOS).
5. Open Brave's side panel and choose **Tabman**.

#### From Source

```powershell
cd extension
bun install
bun run build
```

Load `extension/output/chrome-mv3` via **Load unpacked**. Requires Chromium 114 or newer.

---

### 2. Python CLI Vault

The CLI requires Python 3.14. [uv](https://docs.astral.sh/uv/) installs and manages Python automatically:

#### Run without installing

```powershell
uvx tabman --help
```

#### Install persistently with uv

```powershell
uv tool install tabman
# Or with Python version pinned:
uv tool install --python ">=3.14" tabman
tabman --help
```

#### One-line system installer

Windows PowerShell:

```powershell
irm https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install.ps1 | iex
```

macOS/Linux:

```sh
curl -LsSf https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install.sh | sh
```

---

## Core Surfaces & Capabilities

### 1. The Switchboard (Side Panel)

The side panel serves as your browser's mission control:

- Lists all active windows and tabs in real time.
- Identifies and highlights duplicate tabs across multiple windows with duplicate multipliers (e.g. `×2`).
- Identifies tabs that are playing audio or are currently discarded (sleeping).
- Quick actions to activate, close, discard, or move tabs.
- **Park Window:** Saves an entire window's open tabs into a library collection with options to keep open or close window.

### 2. The Library (Dashboard)

A full-page responsive dashboard (`dashboard.html`):

- **Collections Bento & Stats:** Live collection cards with color badges, tab counts, tag counts, and dynamic rolling number counters (`<NumberTicker />`).
- **Tab Views:** Toggle between visual Grid cards and compact List rows using `<AnimatedTabs />`.
- **Search & Filtering:** Real-time search across titles, URLs, and domains; filter tabs by collection-scoped tags.
- **Drag & Drop:** Drag tabs between collections or rearrange them with FLIP spring layout animations.
- **Command Palette (`Ctrl`/`Cmd` + `K`):** Fast navigation across collections, panels, and actions.
- **Trash & Recovery:** Trashed collections and tabs remain locally recoverable with single-click restore or permanent shredding.

### 3. Rich Visual Link Previews

Tab cards support optional rich thumbnail covers and metadata snippets (similar to Raindrop.io or Pocket):

- Enable in **Preferences &rarr; Rich Link Previews** by entering a free [Iframely](https://iframely.com) API key.
- Test connection live with inline API validation and latency indicators.
- Thumbnails, page summaries, and publication metadata are cached locally in IndexedDB to minimize network requests.
- Automatic graceful fallback to site initial avatars and favicons if previews are disabled or unavailable.

### 4. Smart Organization (Local Rules & AI Engine)

Group unstructured tabs into clean, tagged collections:

- **Local Rules:** Group tabs deterministically using domain match patterns (`*github.com*`, `*arxiv.org*`). Edit via visual cards or direct JSONL code with syntax formatting.
- **AI Tab Organizer:** Batch-analyzes tab titles and URLs to propose cohesive collections.
- **Multiple API Providers:**
  - `openai`: OpenAI compatible gateways (`POST {base}/chat/completions`) and responses format (`POST {base}/responses`).
  - `anthropic`: Anthropic Claude messages API (`POST {base}/v1/messages`).
  - `tabman-local`: Zero-cloud in-browser WebGPU, DirectML, or NPU execution.
  - `ollama`: Localhost models (`POST {base}/api/chat`).
- **Proposal Preview:** Inspect and tweak proposed collections, exclude specific tabs, or rename categories before applying.

---

## Design System & Micro-Interactions

Tabman utilizes a purpose-built design system with zero CSS drift, mapped to native CSS custom properties (`--canvas`, `--surface`, `--brand`, `--border`, `--radius-lg`):

| Component           | Architecture                                                                             | Micro-Interactions & Physics                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `<Button />`        | CVA mapped to `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-destructive` | Framer Motion spring press (`scale: 0.97`) and hover lift (`scale: 1.02`) with 500 stiffness / 28 damping. |
| `<AnimatedTabs />`  | Radix Tabs + Framer Motion `layoutId` pill                                               | Smooth spring pill glide across active tabs; zero layout jump or border clipping.                          |
| `<Switch />`        | Radix Switch primitive                                                                   | 38×22px track with smooth 16px thumb translation.                                                          |
| `<Dialog />`        | Radix Dialog + Framer Motion                                                             | Backdrop blur with scale (`0.98 -> 1`) and slide-up entrance (`y: -6 -> 0`).                               |
| `<TabCard />`       | HTML5 Draggable + Motion Article                                                         | FLIP layout animations on sort/filter, drag elevation, and spring hover lift (`y: -3`).                    |
| `<NumberTicker />`  | NumberFlow React engine                                                                  | Silky smooth digit rolling animations on metrics and collection counts.                                    |
| `<CardSpotlight />` | Dynamic radial gradient canvas                                                           | Mouse-following radial glow highlight for hero cards.                                                      |
| `<BorderBeam />`    | CSS linear gradient beam                                                                 | Ambient orbiting neon border indicator for active states.                                                  |

---

## Local AI Engine (EmbeddingGemma 2)

Tabman includes a complete local AI fine-tuning and inference pipeline based on Google's `EmbeddingGemma 2` architecture (`270m` text, `440m` vision, `740m` full multimodal), optimized for desktop edge devices:

```
[Open Tabs] ──> [Dynamic Chunk Planner] ──> [WebGPU / DirectML / NPU] ──> [13 Rust WASM Kernels] ──> [Clusters & Tags]
```

### Hardware Execution Matrix (`model_int8.onnx`)

| Hardware Engine           | Device / Platform                 | Target Runtime                    | Steady Latency / Tab | Working Memory         | Best Suited For                                           |
| ------------------------- | --------------------------------- | --------------------------------- | -------------------- | ---------------------- | --------------------------------------------------------- |
| **Discrete GPU (dGPU)**   | NVIDIA RTX 4090 / 4060 / A6000    | CUDA / WebGPU WGSL                | **< 2 – 5 ms**       | ~270 MB Dedicated VRAM | High throughput multi-window indexing (> 250 tabs/s)      |
| **Integrated GPU (iGPU)** | Intel Xe-LPG / AMD Radeon         | WebGPU / DirectML                 | **8 – 15 ms**        | ~270 MB Shared VRAM    | Instant in-browser tab grouping                           |
| **CPU (AVX-VNNI)**        | Intel Core Ultra / AMD Zen 4      | Vector Neural Network Extensions  | **19.9 ms**          | ~320 MB System RAM     | High-speed local CPU execution                            |
| **NPU (Neural Silicon)**  | Intel AI Boost / OpenVINO / WebNN | Systolic Array (Static 32 tokens) | **106.8 ms**         | ~250 MB Shared RAM     | **Ultra-Low Power (< 2.5W)** silent background clustering |
| **WASM SIMD Fallback**    | Universal x86_64 / ARM64          | Rust WASM SIMD 128-bit            | **~90 – 125 ms**     | ~320 MB System RAM     | Universal compatibility across all browsers               |

### Published Hugging Face Models

- [`Anshulgada/tabman-embeddinggemma-2-270m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-270m) — Fine-tuned (Text & Code) with WebGPU INT8 ONNX
- [`Anshulgada/tabman-embeddinggemma-2-440m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-440m) — Fine-tuned (Text + Vision) with WebGPU INT8 ONNX
- [`Anshulgada/tabman-embeddinggemma-2-740m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-740m) — Fine-tuned (Full Multimodal) with WebGPU INT8 ONNX

---

## Rust WebAssembly SIMD Acceleration

The extension bundles a compiled Rust WebAssembly module (`tabman_wasm.wasm`) providing 13 hand-vectorized kernels:

1. `cosine_similarity_simd` — 128-bit SIMD float32 dot product.
2. `batch_cosine_similarity` — Parallel query-to-library matching.
3. `pairwise_distance_matrix` — Pairwise distance computation for clustering.
4. `vector_search_top_k` — Max-heap bounded top-k retrieval.
5. `prim_mst_clustering` — Minimum Spanning Tree hierarchical tab grouping.
6. `fuzzy_score_batch` — Fast string distance calculation across open tabs.
7. `dedup_urls_canonical` — URL normalization and exact collision pruning.
8. `minhash_signature` — Locality-sensitive hashing for content near-duplicates.
9. `jaccard_similarity` — Fast set overlap on domain tags.
10. `lz_compress_buffer` — High-speed local storage compression.
11. `lz_decompress_buffer` — Streaming tab decompression.
12. `kmeans_partition` — Fast spatial tab partitioning.
13. `matrix_roofline_benchmark` — Runtime throughput validation.

---

## CLI Reference

```powershell
# Help and status
tabman --help
tabman version
tabman update --check

# Vault and data
tabman import path/to/backup.json
tabman import old-tabs.json --legacy
tabman export backup.json
tabman export backup.md --format markdown
tabman search "github"

# Live Chromium browser capture
tabman cdp status
tabman cdp enable
tabman cdp disable
tabman capture --name "Research Session"

# BYOK AI Organization
tabman config list-providers
tabman config add-provider "Local Ollama" --base-url http://127.0.0.1:11434/v1 --model qwen3 --format openai
tabman config set-key "Local Ollama"
tabman organize --provider "Local Ollama"
tabman organize --apply --yes
```

---

## Development & Quality Gates

### Prerequisites

- Python 3.14 (managed by `uv`)
- Bun 1.4+
- Node 24+

### Local Verification Commands

Run Python checks:

```powershell
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run ty check
```

Run Extension checks:

```powershell
cd extension
bun run check
bun run typecheck
bun run test
bun run build
bun run zip
```

### Path-Filtered Pre-Commit Gating

All linting, formatting, type checking, and path-filtered build gates run automatically during `git commit` via [scripts/ci_gates.py](scripts/ci_gates.py):

- Commits touching `extension/` verify Biome, TypeScript, Vitest (163 tests), and extension bundling before the commit is created.
- `git push` remains a pure, instantaneous network operation.

To test the full local CI pipeline:

```powershell
uv run python scripts/ci_local.py
```

---

## License

[MIT](LICENSE) © Anshul Gada
