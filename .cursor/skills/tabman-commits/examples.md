# Tabman commit examples

Match this structure and depth. Replace example versions with the versions actually read from the repo.

## Planning trio before canonical packaging

```text
docs(rebuild): add research, plan, and phased task checklist

Capture the approved dual-surface product direction before implementation starts.
No runtime or packaging behavior changes in this commit.

docs/TABMAN-REBUILD-RESEARCH.md:
- Preserve the full planning iteration and verified legacy audit

docs/TABMAN-REBUILD-PLAN.md:
- Define the Raindrop-inspired switchboard/library product and CLI bridge
- Record WXT, uv, structured AI, privacy, and sideload decisions
- Add the reusable new-agent prompt

docs/TABMAN-REBUILD-TASKS.md:
- Break delivery into gated phases from scaffold through acceptance

Version bump skipped: canonical pyproject.toml is introduced in Phase 2.
```

## Python/uv foundation

```text
refactor(cli): establish uv package and src layout (Phase 2)

Replace the legacy setup.py package shape with the canonical Python foundation.
No CLI behavior is redesigned in this commit.

pyproject.toml:
- Define tabman metadata, Python 3.12 floor, console script, dependency groups,
    and Ruff/ty/pytest/Bandit configuration

src/tabman/:
- Move importable package code under the src layout
- Preserve current behavior while removing cwd-dependent imports

uv.lock:
- Lock the new project and development groups

Version-Bump: 0.2.1 → 0.2.2
```

## Extension foundation

```text
feat(extension): scaffold WXT side panel and dashboard (Phase 2)

Create the sideload-first Manifest V3 shell without implementing tab-management
behavior yet.

extension/package.json / extension/bun.lock:
- Add WXT, React, TypeScript, Biome, Vitest, and reproducible Bun scripts

extension/wxt.config.ts:
- Define the Brave/Chromium manifest and least-privilege permissions

extension/entrypoints/:
- Add background, sidepanel, and dashboard entrypoint shells

Version-Bump: 0.2.2 → 0.2.3
```

## Shared schema across Python and TypeScript

```text
feat(schema): add versioned collection interchange contract (Phase 3)

Define one portable format so the CLI vault and extension library can round-trip
sessions without CDP or implementation-specific fields.

packages/schema/collection.schema.json:
- Model collections, tabs, tags, timestamps, source metadata, and schema version

src/tabman/models/:
- Validate imports and exports with Pydantic models

extension/src/schema/:
- Parse the same contract with Zod before IndexedDB writes

tests/ / extension/tests/:
- Prove fixture round trips and reject incompatible schema versions

Version-Bump: 0.2.3 → 0.2.4
```

## CLI correctness feature

```text
fix(cli): replace broken search path with vault query output (Phase 4)

Make search usable from scripts and terminals while leaving AI organization for
a separate commit.

src/tabman/cli/search.py:
- Query the canonical vault without parsing generated Markdown
- Support Rich table and machine-readable JSON output

src/tabman/vault/:
- Add normalized tag, collection, domain, and date filters

tests/cli/test_search.py:
- Cover empty results, combined filters, JSON output, and invalid arguments

Version-Bump: 0.2.4 → 0.2.5
```

## Extension live switchboard

```text
feat(extension): add cross-window tab search and focus (Phase 5)

Deliver the first daily-use switchboard flow for users with many Brave windows.
Parking and collection persistence remain in the next logical commit.

extension/entrypoints/background.ts:
- Query normal browser windows and expose validated tab snapshots
- Focus the owning window before activating a selected tab

extension/entrypoints/sidepanel/:
- Search tabs across every window with keyboard navigation
- Group results by window and show tab counts and active state

extension/tests/:
- Mock browser APIs for cross-window search, focus, and missing-window failures

Version-Bump: 0.2.5 → 0.2.6
```

## Batched structured AI

```text
feat(ai): propose collection groups in one validated batch (Phase 7)

Replace per-tab requests with a review-before-apply proposal shared by the CLI
and extension. No browser changes occur until the user confirms the preview.

packages/schema/ai-proposal.schema.json:
- Map every input tab id to one collection suggestion and normalized tags

src/tabman/ai/:
- Request and validate Pydantic structured output with bounded retries

extension/src/ai/:
- Validate provider responses with Zod in the background service worker
- Reject missing, duplicate, or unknown tab ids before rendering the preview

tests/ / extension/tests/:
- Cover valid batches, malformed responses, partial mappings, and cancellation

Version-Bump: 0.2.6 → 0.2.7
```

## Final task checkpoint in a batch

```text
docs(rebuild): mark Phase 5 switchboard gate complete

Record the verified phase result after the Brave sideload acceptance pass.

docs/TABMAN-REBUILD-TASKS.md:
- Mark cross-window listing, search, focus, duplicates, and parking complete
- Record the Phase 5 gate as passed after manual Brave verification

Version-Bump: 0.2.7 → 0.2.8
```

## Cherry-pick

```text
fix(extension): preserve window focus during tab activation

Port the confirmed activation fix while retaining Tabman's browser error
handling and test contract.

extension/src/browser/windows.ts:
- Focus the target window before updating the active tab

Cherry-picked-from: 7a3f2c1
Version-Bump: 0.2.8 → 0.2.9
```

## Proposed output when the user did not ask to commit

```markdown
### Commit 1: shared collection schema

git add packages/schema src/tabman/models extension/src/schema tests/fixtures

Message:
```text
feat(schema): add versioned collection interchange contract

Define one portable format for extension and CLI round trips.

packages/schema/:
- Add collection, tab, tag, and schema-version definitions

Version-Bump: 0.2.3 → 0.2.4
```
```
