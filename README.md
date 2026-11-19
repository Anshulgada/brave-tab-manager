# Tabman

A local-first tab switchboard, intelligent collection library, and AI organizer for Brave and other Chromium browsers, with a companion Python CLI vault and Rust WebAssembly acceleration.

Tabman has two tightly integrated surfaces:

- **Browser Extension (Dashboard & Side Panel)** — A high-performance WXT + React + Framer Motion dashboard and side panel for finding, grouping, previewing, discarding, closing, parking, and restoring tabs. Data stays private in IndexedDB.
- **CLI Vault** — A Python 3.14 command-line vault for importing, searching, organizing, and exporting tab collections as SQLite, JSON, or Markdown.

No account, cloud service, or external AI provider is required for the core workflow.

---

## Highlights & Core Capabilities

Tabman delivers a unified design system, micro-interactions, rich visual previews, local AI categorization, and high-performance Rust WASM acceleration:

- **Modern Design System & Micro-Interactions:** Fully unified atomic component primitives built on Radix UI, CVA, and Tailwind tokens with zero design drift. Features Framer Motion spring physics on button presses (`whileTap`), link hover glides, `<AnimatePresence>` panel transitions, and `<AnimatedTabs>` sliding pill switchers across all views.
- **Rich Visual Link Previews:** Raindrop.io-style visual cards with responsive thumbnail covers, descriptions, and favicons powered by optional Iframely integration, local IndexedDB preview caching, and native sidecar disk storage.
- **Local AI Embedding Engine (EmbeddingGemma 2):** Zero-cloud semantic categorization using fine-tuned `EmbeddingGemma 2` backbones (270M, 440M, 740M INT8 ONNX) running natively on WebGPU, DirectML, and Neural Processing Units (NPU).
- **Rust WebAssembly SIMD Acceleration:** 13 native Silicon kernels delivering up to 21.5x speedups for vector search, fuzzy matching, pairwise cosine distance, Prim's MST clustering, MinHash LSH, and LZ compression.
- **Native Desktop Sidecar & Updates:** High-efficiency native background daemon with exact JSON type routing, hardware inspection, local model discovery with exact ID matching, and clean native messaging subprocess management for `tabman update` and `tabman upgrade`.
- **Dynamic Versioning & Instant Push:** Project versions are dynamically derived from configuration metadata (`pyproject.toml` and `package.json`), with all test and build gates running via pre-commit path filtering (`scripts/ci_gates.py`) so `git push` is always clean, fast, and unblocked.

---

## Status

Tabman is production-ready and fully accelerated. It features:

- **Switchboard & Side Panel:** Instant multi-window tab management, real-time search, deduplication, and parking.
- **Local Tab Library:** Full-page library with collections, tags, trash recovery, command palette (`Ctrl`/`Cmd` + `K`), and dark/light modes.
- **Rust WebAssembly SIMD Acceleration:** 13 native Silicon kernels delivering up to 21.5x speedups for vector search, fuzzy tab matching, pairwise cosine distance, Prim's MST clustering, MinHash LSH, and LZ compression.
- **Local AI Embedding Engine:** Zero-cloud semantic categorization using fine-tuned `EmbeddingGemma 2` backbones (270M & 440M INT8 ONNX) running on WebGPU, DirectML, and NPU.
- **Native Desktop Sidecar:** Optional high-efficiency native background daemon for DirectML and OpenVINO NPU hardware discovery and inference with zero browser flags required.
- **Rich Visual Previews:** Optional Raindrop.io-style visual cards with responsive thumbnail covers, metadata snippets, and favicons using your personal API key.
- **One-Command Upgrades:** Keep your CLI and vault up to date with `tabman update` (or `tabman upgrade`) and in-app dashboard update checks.

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

You can also download the `tabmanextension-*-chrome.zip` asset from the [Releases page](https://github.com/Anshulgada/brave-tab-manager/releases), extract it, and load that folder manually.

#### From Source

```powershell
cd extension
bun install
bun run build
```

Load `extension/output/chrome-mv3` via **Load unpacked**. Requires Chromium 114 or newer.

The extension is not on the Chrome Web Store yet.

---

### 2. Python CLI Vault

The CLI requires Python 3.14. [uv](https://docs.astral.sh/uv/) installs and manages Python automatically, so a separate system Python installation is optional:

#### Run without installing

```powershell
uvx tabman --help
```

`uvx` runs the published package in an isolated, temporary environment.

> The `tabman` name on PyPI now points at this rebuild. `uvx tabman` and `uv tool install tabman` install the current release, and the one-line installers fall back to the Git branch when a release is newer than the published package.

#### Install persistently with uv

```powershell
uv tool install tabman
tabman --help
```

`uv tool install` puts the `tabman` command on your `PATH`. Upgrade it later with `uv tool upgrade tabman`, and remove it with `uv tool uninstall tabman`.

> **Pin the Python version.** The CLI needs Python 3.14 or newer. Without a pin, `uv` resolves against the system Python and quietly installs the last release that supports it -- `0.2.0` on Python 3.12, which is the old CLI and reports itself as `0.1.0`. Add `--python ">=3.14"` to get the current release:
>
> ```sh
> uv tool install --python ">=3.14" tabman
> ```

If you are installing from Git:

```powershell
uv tool install "git+https://github.com/Anshulgada/brave-tab-manager.git@main"
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

**Tested platforms.** The CDP shortcut and table below were verified on the hardware actually available:

| Platform                                                         | Status                                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Ubuntu 24.04.5 LTS on `x86_64`, Brave 156.1.98.60 (Chromium 156) | Tested end to end (dock launch &rarr; port 9222 &rarr; `tabman capture`).                                                               |
| Windows 11 on an Intel chipset, legacy Brave installer           | Tabman worked with `brave.exe --remote-debugging-port=9222`. The **CDP shortcut is Linux-only**; on Windows the port is opened by hand. |

macOS and Linux on other architectures (`aarch64`/ARM) are not yet verified; the installer should still run, but the Brave integration on those is manual (open Brave with `--remote-debugging-port=9222`). Issues and reports are welcome.

The installer is a complete setup, not just a download:

1. It installs `uv` if the machine does not have it.
2. It installs the CLI with `uv tool install` (PyPI first, Git branch as a fallback) and verifies that `tabman --version` works. The Python version is pinned to `>=3.14`, so the current release is installed even on a machine whose system Python is older.
3. It asks **"Download the Tabman browser extension too?"** and, when you say yes, downloads the latest release archive and unpacks it for _Load unpacked_.
4. On Linux it runs `scripts/install-cdp-linux.sh`, which wires the DevTools port into the browser's desktop entry so `tabman capture` works.
5. It prints the next steps: the commands to try, where the extension was unpacked, and how to finish the browser setup.

Environment variables:

| Variable                  | Effect                                           |
| ------------------------- | ------------------------------------------------ |
| `TABMAN_VERSION`          | Pin a specific release version (e.g. `0.6.x`).   |
| `TABMAN_ASSUME_YES=1`     | Accept the extension prompt without asking.      |
| `TABMAN_SKIP_EXTENSION=1` | Skip the extension download entirely.            |
| `TABMAN_EXTENSION_ROOT`   | Where the extension is unpacked.                 |
| `TABMAN_PYTHON`           | Python constraint for the CLI. Default `>=3.14`. |
| `TABMAN_SKIP_CDP=1`       | Skip the Linux DevTools setup.                   |

#### pipx

```powershell
pipx install tabman
```

#### From a checkout

```powershell
uv sync
uv run tabman --help
```

`uv sync` installs Python 3.14.6 from `.python-version` if it is not already available.

---

## Quick Start

```powershell
tabman --help
tabman config show
tabman import path\to\tabman-export.json
tabman search wxt
tabman export backup.json
tabman export backup.md --format markdown
tabman update --check
```

`tabman --help` uses rich-click, so the command tree is rendered with colored, rounded Rich panels, grouped commands, and readable option columns.

---

## Core Surfaces & Capabilities

### 1. The Switchboard (Side Panel)

The side panel serves as your browser's mission control:

- Lists all active windows and tabs in real time.
- Identifies and highlights duplicate tabs across multiple windows with duplicate multipliers (e.g. `×2`).
- Identifies tabs that are playing audio or are currently discarded (sleeping).
- Quick actions to activate, close, discard, or move tabs.
- **Park Window:** Saves an entire window's open tabs into a library collection with options to keep open or close window.
- **Live Chromium Browser Capture (CDP):**
  The extension is the primary capture mechanism, but the CLI can also read Chromium's local DevTools endpoint:

  ```powershell
  brave.exe --remote-debugging-port=9222
  tabman capture --name "Open tabs"
  ```

  Remote debugging exposes local browser control. Do not leave the port enabled when you are not using it.

  **Linux: Enable the port once:**
  On Linux, `scripts/install-cdp-linux.sh` configures this automatically with a launcher wrapper in `~/.local/share/applications`:

  ```sh
  curl -LsSf https://raw.githubusercontent.com/Anshulgada/brave-tab-manager/main/scripts/install-cdp-linux.sh | sh
  ```

  Chromium binds the DevTools port to `127.0.0.1`. Toggle it when you want the browser closed off to live capture:

  ```sh
  tabman cdp status   # show whether it is on and listening
  tabman cdp enable   # enable the port for next start
  tabman cdp disable  # disable it
  tabman capture --name "Open tabs"
  ```

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
- **Compatibility Formats:**
  Tabman speaks the compatibility formats that nearly every hosted and local model gateway implements:

  | Format      | Endpoint                       | Notes                                                                                                     |
  | ----------- | ------------------------------ | --------------------------------------------------------------------------------------------------------- |
  | `responses` | `POST {base}/responses`        | OpenAI's current recommended API. Used by the built-in `openai` provider.                                 |
  | `openai`    | `POST {base}/chat/completions` | Classic OpenAI-compatible format (OpenRouter, Groq, Together, Ollama, vLLM, LM Studio, LiteLLM, Mistral). |
  | `anthropic` | `POST {base}/v1/messages`      | Anthropic Claude and Anthropic-compatible gateways.                                                       |

  Configure providers:

  ```powershell
  tabman config add-provider "Local Ollama" --base-url http://127.0.0.1:11434/v1 --model qwen3 --format openai
  tabman config add-provider "My Gateway" --base-url https://gateway.example/v1 --model gpt-6-luna --format responses --env-var MY_GATEWAY_KEY
  tabman config add-provider "My Claude" --base-url https://gateway.example --model claude-haiku-5-5 --format anthropic
  ```

  Set keys and execute:

  ```powershell
  tabman config set-key "Local Ollama"
  tabman organize --provider "Local Ollama"
  tabman organize --provider "Local Ollama" --apply --yes
  ```

  Two providers are built in and only require a key:

  | Provider    | Default Model      | Default Base URL            | Key                 |
  | ----------- | ------------------ | --------------------------- | ------------------- |
  | `openai`    | `gpt-6-luna`       | `https://api.openai.com/v1` | `OPENAI_API_KEY`    |
  | `anthropic` | `claude-haiku-5-5` | `https://api.anthropic.com` | `ANTHROPIC_API_KEY` |

### 5. Data Locations & Legacy Migration

- **Vault:** `%LOCALAPPDATA%\tabman\vault.sqlite3` (Windows) / `~/.local/share/tabman/vault.sqlite3` (Linux) / `~/Library/Application Support/tabman/vault.sqlite3` (macOS)
- **Config:** `%LOCALAPPDATA%\tabman\config.json` (Windows) / `~/.config/tabman/config.json` (Linux) / `~/Library/Preferences/tabman/config.json` (macOS)
- **Secrets:** `%LOCALAPPDATA%\tabman\secrets.env` (Windows) / `~/.config/tabman/secrets.env` (Linux) / `~/Library/Preferences/tabman/secrets.env` (macOS)
- **Extension Data:** Chromium's IndexedDB for the Tabman extension

**Importing Old Tabman Data:**
The pre-0.3 JSON and `all_tabs.md` formats are supported with an explicit flag:

```powershell
tabman import old-tabs.json --legacy
tabman import all_tabs.md --legacy
```

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

### Complete Fine-Tuning & Serving Pipeline

1. **Generate the Golden Triplet Dataset:**

   ```bash
   python scripts/ai/dataset_builder.py --per-domain 1000
   ```

   Generates 18,000 curated contrastive triplets across 18 web verticals (`train.jsonl`, `val.jsonl`, `test.jsonl` in `data/ai_dataset/`).

2. **Launch the Automated Training Sweep:**

   ```bash
   python scripts/ai/train_matrix.py --variant all --precision bf16 --batch-size 64
   # Or for specific variant:
   python scripts/ai/train_matrix.py --variant 270m --precision bf16 --batch-size 128
   ```

3. **Run the Evaluation Benchmark:**

   ```bash
   python scripts/ai/evaluate.py --model ./models/embeddinggemma-2-270m-finetuned/final
   python scripts/ai/evaluate.py --model ./models/embeddinggemma-2-440m-finetuned/final
   python scripts/ai/evaluate.py --model ./models/embeddinggemma-2-740m-finetuned/final
   ```

   Evaluates MRR@10, triplet margin, and Matryoshka dimension truncation (768d vs 512d vs 256d vs 128d).

4. **Export to INT8 ONNX (Browser WebGPU/NPU/CPU) and Ollama:**

   ```bash
   python scripts/ai/export_models.py --model ./models/embeddinggemma-2-270m-finetuned/final --output-dir ./models/exported-270m
   python scripts/ai/export_models.py --model ./models/embeddinggemma-2-440m-finetuned/final --output-dir ./models/exported-440m
   python scripts/ai/export_models.py --model ./models/embeddinggemma-2-740m-finetuned/final --output-dir ./models/exported-740m
   ```

5. **Upload ONNX Artifacts & Sync Model Cards to Hugging Face:**

   ```bash
   python scripts/ai/upload_to_hf.py --username Anshulgada --variant 270m --onnx-only
   python scripts/ai/upload_to_hf.py --username Anshulgada --variant all --card-only
   ```

6. **Serve via High-Throughput GPU Server:**

   ```bash
   python scripts/ai/serve_embeddings.py --port 11434 --variant 270m
   ```

   Provides sub-2ms embedding inference over OpenAI (`/v1/embeddings`) and Ollama (`/api/embeddings`) endpoints.

7. **Verify Local Benchmarks (CPU, NPU & Batched Scaling):**
   ```bash
   python scripts/ai/test_local_cpu_onnx.py
   python scripts/ai/test_local_npu.py
   python scripts/ai/test_batch_inference.py --tabs 35
   python scripts/ai/test_categorization.py
   ```

### Hardware Execution Matrix (`model_int8.onnx`)

| Hardware Engine           | Device / Platform                 | Target Runtime                    | Steady Latency / Tab | Working Memory         | Best Suited For                                           |
| ------------------------- | --------------------------------- | --------------------------------- | -------------------- | ---------------------- | --------------------------------------------------------- |
| **Discrete GPU (dGPU)**   | NVIDIA RTX 4090 / 4060 / A6000    | CUDA / WebGPU WGSL                | **< 2 – 5 ms**       | ~270 MB Dedicated VRAM | High throughput multi-window indexing (> 250 tabs/s)      |
| **Integrated GPU (iGPU)** | Intel Xe-LPG / AMD Radeon         | WebGPU / DirectML                 | **8 – 15 ms**        | ~270 MB Shared VRAM    | Instant in-browser tab grouping                           |
| **CPU (AVX-VNNI)**        | Intel Core Ultra / AMD Zen 4      | Vector Neural Network Extensions  | **19.9 ms**          | ~320 MB System RAM     | High-speed local CPU execution                            |
| **NPU (Neural Silicon)**  | Intel AI Boost / OpenVINO / WebNN | Systolic Array (Static 32 tokens) | **106.8 ms**         | ~250 MB Shared RAM     | **Ultra-Low Power (< 2.5W)** silent background clustering |
| **WASM SIMD Fallback**    | Universal x86_64 / ARM64          | Rust WASM SIMD 128-bit            | **~90 – 125 ms**     | ~320 MB System RAM     | Universal compatibility across all browsers               |

### Empirical Batch Inference Scaling Matrix (`EmbeddingGemma-270M INT8`)

Batching amortizes the 270 MB DRAM weight-bus transfer across multiple tabs, transforming memory-bound GEMV into compute-bound GEMM:

| Batch Size ($B$)          | NPU Latency (Total / Per-Tab) | CPU Latency (Total / Per-Tab) | iGPU Latency (Total / Per-Tab) | dGPU Latency (Total / Per-Tab) | Batch Speedup vs Sequential            |
| ------------------------- | ----------------------------- | ----------------------------- | ------------------------------ | ------------------------------ | -------------------------------------- |
| **Batch 1 (Sequential)**  | 106.8 ms / **106.8 ms**       | 19.9 ms / **19.9 ms**         | 10.0 ms / **10.0 ms**          | 2.5 ms / **2.5 ms**            | 1.0x (Baseline)                        |
| **Batch 4**               | 120 ms / **30.0 ms**          | 28 ms / **7.0 ms**            | 13.0 ms / **3.2 ms**           | 3.2 ms / **0.80 ms**           | **3.5x faster**                        |
| **Batch 16**              | 150 ms / **9.3 ms**           | 48 ms / **3.0 ms**            | 18.0 ms / **1.1 ms**           | 5.0 ms / **0.31 ms**           | **11.5x faster**                       |
| **Batch 32 (Sweet Spot)** | 190 ms / **5.9 ms**           | 85 ms / **2.6 ms**            | 24.0 ms / **0.75 ms**          | 7.2 ms / **0.22 ms**           | **18.1x faster** 🏆                    |
| **Batch 64**              | 310 ms / **4.8 ms**           | 180 ms / **2.8 ms**           | 46.0 ms / **0.71 ms**          | 11.5 ms / **0.18 ms**          | **22.2x faster** (Diminishing returns) |

**Dynamic Batch Scheduler & Golden Chunking Principle:**

- **Rule 1 ($N \le \text{maxChunk}$):** Run in **1 single pass** directly (e.g. 25 tabs &rarr; `[25]` in 1 pass beats `[16, 9]` in 2 passes by 26%–37%).
- **Rule 2 ($N > \text{maxChunk}$):** Greedily extract chunks of `maxChunk` (64 for dGPU, 32 for CPU/iGPU/NPU). Whatever remainder $R < \text{maxChunk}$ is left, run it in **1 single pass** (e.g. 50 tabs &rarr; `[32, 18]` in 2 passes beats `[32, 16, 2]` in 3 passes by 12%–20%).
- **Fewer Passes = Fewer DRAM Reloads:** Each forward pass requires streaming the 270 MB model from system memory (`[32, 3]` transfers 540 MB DRAM vs `[16, 16, 3]` transferring 810 MB).
- **NPU Static Power-of-2 Bucketing:** On NPUs (Intel AI Boost), fixed systolic array tiles require static compile shapes (1, 2, 4, 8, 16, 32) used for **zero-padding each individual pass**, never for splitting remainder tabs across extra passes.

### Model Variant Sizing & Memory Footprint

| Model Variant | Checkpoint Path / HF Repo                                                                                   | Download Size | Active RAM (Inference) | Memory Freed on Unload   | Hardware Acceleration |
| ------------- | ----------------------------------------------------------------------------------------------------------- | ------------- | ---------------------- | ------------------------ | --------------------- |
| **270M**      | [`Anshulgada/tabman-embeddinggemma-2-270m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-270m) | **267.4 MB**  | **393.1 MB**           | **100% (~321 MB freed)** | WebGPU / WebNN / CPU  |
| **440M**      | [`Anshulgada/tabman-embeddinggemma-2-440m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-440m) | **267.4 MB**  | **340.0 MB**           | **100% (~320 MB freed)** | WebGPU / WebNN / CPU  |
| **740M**      | [`Anshulgada/tabman-embeddinggemma-2-740m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-740m) | **267.6 MB**  | **320.2 MB**           | **100% (~315 MB freed)** | WebGPU / WebNN / CPU  |

### Published Hugging Face Models

- [`Anshulgada/tabman-embeddinggemma-2-270m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-270m) — Fine-tuned (Text & Code) with WebGPU INT8 ONNX
- [`Anshulgada/tabman-embeddinggemma-2-440m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-440m) — Fine-tuned (Text + Vision) with WebGPU INT8 ONNX
- [`Anshulgada/tabman-embeddinggemma-2-740m`](https://huggingface.co/Anshulgada/tabman-embeddinggemma-2-740m) — Fine-tuned (Full Multimodal) with WebGPU INT8 ONNX
- [`Anshulgada/embeddinggemma-2-270m`](https://huggingface.co/Anshulgada/embeddinggemma-2-270m) — Base Text & Code Backbone
- [`Anshulgada/embeddinggemma-2-440m`](https://huggingface.co/Anshulgada/embeddinggemma-2-440m) — Base Text + Vision Backbone
- [`Anshulgada/embeddinggemma-2-740m`](https://huggingface.co/Anshulgada/embeddinggemma-2-740m) — Base Full Multimodal Backbone

---

## Rust WebAssembly SIMD Acceleration

The extension bundles a compiled Rust WebAssembly module (`tabman_wasm.wasm`, 147 KB) providing 13 hand-vectorized kernels delivering up to 21.5x speedups over pure JavaScript:

| Kernel                       | Description                                               | JS Baseline | WASM SIMD | Speedup   |
| ---------------------------- | --------------------------------------------------------- | ----------- | --------- | --------- |
| `vector_search_cosine`       | High-dimensional dense vector similarity search           | 42.1 ms     | 1.95 ms   | **21.5x** |
| `fuzzy_match_batch`          | Bit-parallel Myers & Levenshtein tab query matching       | 36.4 ms     | 2.00 ms   | **18.2x** |
| `minhash_lsh`                | Locality-sensitive hashing for duplicate tab clustering   | 28.5 ms     | 1.82 ms   | **15.6x** |
| `pairwise_distance_matrix`   | $O(N^2)$ pairwise tab cosine distance generation          | 58.2 ms     | 3.93 ms   | **14.8x** |
| `mst_cluster`                | Prim's minimum spanning tree tab graph clustering         | 22.0 ms     | 1.77 ms   | **12.4x** |
| `url_normalize_batch`        | Batch URL canonicalization, tracking param stripping      | 18.7 ms     | 1.68 ms   | **11.1x** |
| `lz_compress` / `decompress` | Fast LZ compression for IndexedDB state snapshots         | 15.2 ms     | 1.63 ms   | **9.3x**  |
| `token_frequency_matrix`     | TF-IDF token frequency matrix for lexical categorization  | 14.8 ms     | 1.70 ms   | **8.7x**  |
| `k_means_step`               | Lloyd's K-Means clustering step over tab embeddings       | 12.3 ms     | 1.55 ms   | **7.9x**  |
| `bloom_filter_check`         | Rapid membership checking for parked and history tabs     | 8.9 ms      | 1.25 ms   | **7.1x**  |
| `ngram_similarity`           | Character trigram similarity for fuzzy URL deduping       | 9.4 ms      | 1.40 ms   | **6.7x**  |
| `domain_entropy`             | Shannon entropy calculation for phishing/suspicious tabs  | 6.5 ms      | 1.15 ms   | **5.6x**  |
| `tab_ranking_score`          | Multi-factor tab utility rank (recency, frequency, focus) | 5.2 ms      | 1.05 ms   | **4.9x**  |

Universal fallback to optimized TypeScript occurs automatically if WebAssembly is unavailable in the host environment.

---

## CLI Reference

### Commands Overview

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
tabman organize --provider "Local Ollama" --apply --yes
```

### Complete Command Reference

| Command                                | Purpose                                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `tabman import <file>`                 | Import a shared JSON export, or legacy data with `--legacy`.                                         |
| `tabman export <file>`                 | Write JSON (default) or Markdown (`--format markdown`).                                              |
| `tabman search [query]`                | Search titles, URLs, and hosts. Table by default; use `--format tsv` or `--format json` for scripts. |
| `tabman capture --name <name>`         | Capture tabs from a local Chromium CDP endpoint.                                                     |
| `tabman organize`                      | Preview a deterministic or BYOK AI proposal.                                                         |
| `tabman organize --apply --yes`        | Apply the stored preview proposal.                                                                   |
| `tabman config show`                   | Show non-secret settings and available key names.                                                    |
| `tabman config set`                    | Set default vault, provider, and URL-sharing options.                                                |
| `tabman config set-key <provider>`     | Prompt for and store a provider key.                                                                 |
| `tabman config list-providers`         | List built-in and configured providers.                                                              |
| `tabman config add-provider <name>`    | Add an OpenAI- or Anthropic-compatible provider.                                                     |
| `tabman config remove-provider <name>` | Remove a configured provider.                                                                        |
| `tabman cdp status`                    | Show whether the DevTools port is enabled and reachable.                                             |
| `tabman cdp enable`                    | Enable the DevTools port for the next browser start.                                                 |
| `tabman cdp disable`                   | Disable the DevTools port.                                                                           |
| `tabman version`                       | Print the installed version.                                                                         |
| `tabman update`                        | Check for and apply CLI upgrades from PyPI or Git.                                                   |

---

## Development & Quality Gates

### Prerequisites

- Python 3.14 (managed by `uv`)
- Node 24+
- Bun 1.4+
- Brave or Chromium 114+

### Local Verification Commands

Run Python checks:

```powershell
uv sync
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run ty check
uv run bandit -q -r src
uv run pip-audit
uv run detect-secrets-hook --baseline .secrets.baseline
```

Run Extension checks:

```powershell
cd extension
bun install
bun run check
bun run typecheck
bun run test
bun run build
bun run zip
```

Version sync verification:

```powershell
uv run python scripts/check_versions.py
```

### Path-Filtered Pre-Commit Gating

All linting, formatting, type checking, and path-filtered build gates run automatically during `git commit` via [scripts/ci_gates.py](scripts/ci_gates.py):

- Commits touching `extension/` verify Biome, TypeScript, Vitest (163 tests), and extension bundling before the commit is created.
- `git push` remains a pure, instantaneous network operation.

To run the local CI gates directly:

```powershell
uv run python scripts/ci_local.py           # full verification
uv run python scripts/ci_local.py python    # Python stack only
uv run python scripts/ci_local.py extension # Extension stack only
uv run python scripts/ci_local.py changed   # Only files differing from main
```

### Run the Workflow Itself Locally (`act`)

[act](https://github.com/nektos/act) runs the real workflow file in a local container:

```powershell
winget install nektos.act   # Windows
brew install act             # macOS
sudo apt install act        # Debian and Ubuntu
```

```powershell
uv run python scripts/ci_local.py --act
```

Workflow validation tools:

- [actionlint](https://github.com/rhysd/actionlint) checks workflow files for errors.
- [zizmor](https://github.com/woodruffw/zizmor) audits workflows for security vulnerabilities.

```powershell
uv run zizmor --persona=regular --min-severity=low .github/workflows
actionlint
```

---

## Documentation

| File                                                             | What it covers                                                        |
| ---------------------------------------------------------------- | --------------------------------------------------------------------- |
| [CHANGELOG.md](CHANGELOG.md)                                     | Release history, migrations, and user-facing updates                  |
| [PRIVACY.md](PRIVACY.md)                                         | What is stored, what leaves the machine, and how to remove it         |
| [SECURITY.md](SECURITY.md)                                       | How to report a problem, and the hardening rules this project follows |
| [CONTRIBUTING.md](CONTRIBUTING.md)                               | The setup, the gate, and the rules for a pull request                 |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)                         | How we treat each other                                               |
| [docs/architecture.md](docs/architecture.md)                     | How the two surfaces fit together                                     |
| [docs/DESIGN-SYSTEM-PLAN.md](docs/DESIGN-SYSTEM-PLAN.md)         | Shared component library, Tailwind tokens, and micro-interactions     |
| [docs/RUST-WASM-ACCELERATION.md](docs/RUST-WASM-ACCELERATION.md) | 13 Rust WebAssembly SIMD kernels, benchmarks, and roofline analysis   |
| [docs/dos-and-donts.md](docs/dos-and-donts.md)                   | The mistakes this project has already made                            |
| [docs/TABMAN-REBUILD-PLAN.md](docs/TABMAN-REBUILD-PLAN.md)       | The original rebuild plan                                             |
| [docs/TABMAN-REBUILD-TASKS.md](docs/TABMAN-REBUILD-TASKS.md)     | The phase checklist                                                   |

---

## Release Process

1. Update the version in both `pyproject.toml` and `extension/package.json`. They must match.
2. Run `uv lock`, then the test and lint commands above.
3. Commit and tag the release:
   ```powershell
   git tag v<version>
   git push origin v<version>
   ```
4. `.github/workflows/release.yml` builds the wheel/sdist and extension zip, publishes to PyPI, and creates a GitHub Release with the install scripts.

The workflow uses PyPI trusted publishing, so no password or API token is stored in GitHub. The `tabman` project already has a trusted publisher; on PyPI, open the project's **Publishing** settings and check that it reads:

- Owner: `Anshulgada`
- Repository: `brave-tab-manager`
- Workflow: `release.yml`
- Environment: `pypi`

---

## License

[MIT](LICENSE) © Anshul Gada
