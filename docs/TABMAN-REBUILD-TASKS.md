# Tabman Rebuild — Task Checklist

> **Status:** Phases **0–5** complete · product implementation underway · updated 2026-07-19
> **Branch:** `feat/rebuild` (create from `main`) · **Plan:** [`TABMAN-REBUILD-PLAN.md`](TABMAN-REBUILD-PLAN.md) · **Research:** [`TABMAN-REBUILD-RESEARCH.md`](TABMAN-REBUILD-RESEARCH.md)
> **Product:** Sideload WXT+React extension (switchboard + Raindrop-like library) + SokWatch-grade Python CLI vault

Legend: `[ ]` = Not started | `[/]` = In progress | `[x]` = Done | `[~]` = Deferred (post-MVP)

---

## Phase 0 — Clone + Branch

- [x] Clone repo to `D:\brave-tab-manager`
- [x] Confirm `main` tracks `origin/main`
- [x] `git fetch origin`
- [x] `git checkout -b feat/rebuild` (from current `main` / `origin/main`)
- [x] Confirm no implementation on `main` until reviewed merge
- [x] Install and verify local toolchain: `uv`, `bun`, `node` (24+), `pre-commit`

**Phase 0 gate:** On `feat/rebuild` with clean working tree aside from intentional docs.

---

## Phase 1 — Planning Docs (this trio)

- [x] Add `docs/TABMAN-REBUILD-RESEARCH.md` (session research archive)
- [x] Add `docs/TABMAN-REBUILD-PLAN.md` (canonical plan + agent prompt)
- [x] Add `docs/TABMAN-REBUILD-TASKS.md` (this checklist)
- [x] Add `.cursor/skills/tabman-commits/` by combining SokWatch `feat/docs`
      discipline with Attendance Tracker's portable multi-stack workflow

**Phase 1 gate:** Three planning files and the Tabman commit skill are present.

---

## Phase 2 — Monorepo Tooling Scaffold

> **Gate:** Do not ship product features until hooks/tooling skeleton exists.

- [x] **2.1** Root `pyproject.toml` + `uv.lock` (`requires-python >=3.12`)
- [x] **2.2** Move/create package under `src/tabman/` (full layout overhaul OK)
- [x] **2.3** Configure `[tool.ruff]`, `[tool.ty]`, `[tool.bandit]`, `[tool.pytest.ini_options]`
- [x] **2.4** Scaffold `extension/` with WXT + React + TypeScript + Bun
- [x] **2.5** `extension/biome.json`, Node 24 pin, `tsc --noEmit`, scripts (`check`, `test`, `build`, `zip`)
- [x] **2.6** `.pre-commit-config.yaml` — Ruff, ty, Biome, tsc, hygiene, detect-secrets + `.secrets.baseline`
- [x] **2.7** Pre-push path-filtered gates (`pytest` unit / `wxt build`)
- [x] **2.8** Hardened `.gitignore`, `.gitattributes`, `.env.example`, `CHANGELOG.md`
- [x] **2.9** `packages/schema/` stub for shared JSON Schema
- [x] **2.10** CI workflow skeleton: `python` job + `extension` job (no store publish)

**Phase 2 gate:** `uv sync` and `cd extension && bun install` work; pre-commit installs; empty/smoke checks pass.

---

## Phase 3 — Shared Schema + Data Model

- [x] **3.1** Define collection / tab / tag / proposal / settings schema in `packages/schema/`
- [x] **3.2** Python Pydantic models generated/mirrored from schema
- [x] **3.3** Extension Zod schemas mirrored from schema
- [x] **3.4** CLI vault: SQLite or JSONL source of truth + Markdown export-only
- [x] **3.5** Extension Dexie/IndexedDB with migrations
- [x] **3.6** Import/export round-trip tests (fixture JSON)
- [x] **3.7** Legacy importer for old `all_tabs.md` / dated JSON (guarded)

**Phase 3 gate:** CLI and extension can import the same fixture collection JSON.

---

## Phase 4 — Python CLI Rebuild

- [x] **4.1** Subcommands: `capture`, `organize`, `search`, `export`, `import`, `config`, `version`
- [x] **4.2** Fix search output (no bogus await; print JSON/table)
- [x] **4.3** Provider adapters + Mistral base_url / key handling fixed
- [x] **4.4** Batch AI organize with Pydantic/PydanticAI structured output
- [x] **4.5** Secrets via env/config-dir/prompt only (not argv)
- [x] **4.6** Optional CDP capture with safe disconnect; import-from-export preferred path
- [x] **4.7** Domain matching via proper host suffix checks
- [x] **4.8** Unit tests with mocks; `@pytest.mark.integration` for live keys
- [x] **4.9** PyQt: optional extra or remove broken entrypoint
- [x] **4.10** Version single-sourced from `pyproject.toml`

**Phase 4 gate:** `uv run tabman --help` and core subcommands work offline with fixtures.

---

## Phase 5 — Extension Switchboard (Side Panel)

- [x] **5.1** Background service worker messaging + tab/window queries
- [x] **5.2** Side panel: list all windows with counts
- [x] **5.3** Cross-window search + activate/focus tab
- [x] **5.4** Multi-select close / discard / move / tab groups
- [x] **5.5** Cross-window duplicate detection
- [x] **5.6** Park window / park selection → collection
- [x] **5.7** Keyboard navigation + empty/loading/error states

**Phase 5 gate:** Sideload in Brave; find and focus a tab in another window; park a selection.

---

## Phase 6 — Extension Library Dashboard

- [ ] **6.1** Full-page dashboard entrypoint
- [ ] **6.2** Collections list + detail (Raindrop-like)
- [ ] **6.3** Tags, filters, list/grid views
- [ ] **6.4** Bulk tag/move/delete + trash
- [ ] **6.5** Restore selected/all with partial-failure feedback
- [ ] **6.6** Import/export UI (shared schema)
- [ ] **6.7** Settings + privacy controls + onboarding
- [ ] **6.8** System light/dark + a11y pass

**Phase 6 gate:** Full park → browse library → restore loop works without AI.

---

## Phase 7 — Optional BYOK AI

- [ ] **7.1** Adapter registry (Gemini, OpenAI, Anthropic, Groq, Ollama, custom base URL)
- [ ] **7.2** Runtime optional host permissions (HTTPS/localhost only)
- [ ] **7.3** Batch request → one structured response for all tabs
- [ ] **7.4** Zod validation in service worker; invalid batch rejected
- [ ] **7.5** Preview diff → user confirm → apply (Stella pattern)
- [ ] **7.6** Deterministic local fallback always available
- [ ] **7.7** Session-only keys + forget-key; no keys in logs
- [ ] **7.8** CLI parity with Pydantic structured batch organize
- [ ] **7.9** Contract tests for valid/invalid structured payloads

**Phase 7 gate:** Organize preview works with one provider OR deterministic fallback; no apply without confirm.

---

## Phase 8 — Quality, Docs, Sideload Release

- [ ] **8.1** Vitest + Testing Library coverage for core extension flows
- [ ] **8.2** Python unit suite green in CI without secrets
- [ ] **8.3** CI uploads `wxt zip` sideload artifact
- [ ] **8.4** README: Load unpacked (Brave/Chrome) + CLI `uv` install
- [ ] **8.5** `PRIVACY.md`, architecture notes, dos-and-donts
- [ ] **8.6** Community files: CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates
- [ ] **8.7** Archive/remove stale `Prompt.md`, `.structure`, BrowserStack claims
- [ ] **8.8** Manifest permission audit; no embedded secrets
- [ ] **8.9** Manual Brave acceptance: switchboard, park/restore, optional AI, CLI schema round-trip
- [ ] **[~]** Chrome Web Store listing (optional, deferred)
- [ ] **[~]** PyPI publish (optional, gated)

**Phase 8 gate:** MVP success criteria in the Plan §10 are met.

---

## Agent usage

When opening a new agent, paste the prompt from Plan §11 and set `Phase [X]` to the next incomplete phase gate.
