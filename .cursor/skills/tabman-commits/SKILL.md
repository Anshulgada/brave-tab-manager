---
name: tabman-commits
description: Prepare and create atomic Tabman commits across the Python/uv CLI, WXT/Bun extension, shared schema, tests, and rebuild docs. Use when the user asks to commit, split changes, draft commit messages, update rebuild task checkpoints, or prepare a phase for review.
disable-model-invocation: true
---

# Tabman Commits

Project commit workflow synthesized from SokWatch `feat/docs` and Attendance Tracker `main`.

Sources of truth:

- `docs/TABMAN-REBUILD-PLAN.md`
- `docs/TABMAN-REBUILD-TASKS.md`
- `docs/TABMAN-REBUILD-RESEARCH.md` (context only; do not execute from it)

## Safety defaults

- Do not commit unless the user explicitly asks. Otherwise return proposed commit groups, exact `git add` commands, and complete messages.
- Do not push, publish, tag, amend, rebase, update git config, or run destructive git commands unless explicitly requested.
- Never commit `.env`, API keys, credentials, browser data, local vaults, `node_modules/`, `.venv/`, build output, or sideload ZIPs unless the user explicitly requests an intended artifact.
- Work on `feat/rebuild` until reviewed merge. If branch state differs, report it before committing.

## Detect the current project profile

Tabman is transitioning from legacy Python packaging to a Python + extension monorepo. Inspect the repo before applying version or lockfile rules.

| Signal | Profile | Version source | Lock/check commands |
| --- | --- | --- | --- |
| `pyproject.toml` + `uv.lock` | Target Python CLI | root `pyproject.toml` | `uv sync`; Ruff, ty, pytest, pre-commit |
| `extension/package.json` + `extension/bun.lock` | Target WXT extension | mirrors root for extension releases | `bun install`; Biome, tsc, Vitest, WXT |
| `packages/schema/` | Shared contract | root version | validate Python + extension consumers |
| Legacy `setup.py` without `pyproject.toml` | Pre-migration | existing `setup.py` only | use existing tests; do not invent target files |

User instructions override these defaults.

## Atomic grouping

One commit is one logical, reviewable, bisectable change—not one file and not a kitchen sink.

Typical Tabman groups:

1. Foundation/config/dependencies
2. Shared schema or persistence model
3. Python CLI implementation
4. Extension implementation
5. Tests for the same behavior (keep with implementation when tightly coupled)
6. Docs and rebuild task checkpoint last in a batch

Keep cross-stack files together when they implement one contract. For example, a shared schema change plus its Pydantic/Zod consumers and round-trip tests is one logical commit.

Do not mix unrelated Python CLI and extension features merely because both are ready.

### Rebuild task files

- Update `docs/TABMAN-REBUILD-TASKS.md` only in the final commit of a phase/batch.
- Use `[/]` while genuinely in progress, `[x]` only after the phase gate passes, and `[~]` for explicit deferral.
- Update the Plan only when a decision changes; keep raw iteration notes in Research.
- Never mark a gate complete from code presence alone—run its stated verification.

## Version rules

1. Before target packaging exists, follow the detected legacy profile. Planning-only commits may skip a version bump.
2. After root `pyproject.toml` exists, it is the canonical repo version.
3. Bump patch once per non-trivial commit, immediately before that commit—not while still coding.
4. Read the current version and increment it; never hardcode a future version in advance.
5. After a root bump, run `uv sync` and include `uv.lock`.
6. When an extension artifact changes, mirror the final root version into `extension/package.json` and refresh `extension/bun.lock`.
7. For multi-commit batches, sync the extension version in the last extension/batch commit; never create a version-only commit.
8. Skip only trivial typo/comment-only work. State `Version bump skipped: non-functional docs-only change.` in the body.
9. Do not bump nested package versions independently unless that package becomes intentionally versioned.

## Required inspection

When the user asks to commit, run these read-only checks in parallel:

```text
git status --short --branch
git diff
git diff --staged
git log -5 --format="%h %s"
```

Then:

1. Account for every staged, unstaged, and untracked file.
2. Flag likely secrets or generated artifacts.
3. Compare changes with the relevant phase gate.
4. Propose a split first if more than one logical group exists, unless the user explicitly said to commit everything as one unit.

## Per-commit sequence

Run from repo root and adapt checks to the files in the group.

1. Stage candidate paths only to inspect the exact commit diff when useful.
2. Bump the canonical patch version only when the group is ready.
3. Sync affected lockfiles:
   - Python/root version or dependencies: `uv sync`
   - Extension package/dependencies: `cd extension && bun install`
4. Run checks:
   - If `.pre-commit-config.yaml` exists: `uv run pre-commit run --all-files`
   - Python: Ruff, ty, and focused pytest targets
   - Extension: Biome, `tsc --noEmit`, focused Vitest, and WXT build when relevant
   - Shared schema: both Python and TypeScript contract tests
5. Fix failures. If tools modify files, re-stage and repeat until clean.
6. Review `git diff --staged`; ensure it contains only this group.
7. Commit only if explicitly requested.
8. Run `git status --short --branch` after each commit.

Never bypass hooks. Do not create repo-local cache directories to work around Cursor permission errors; restore normal user cache/tool paths instead.

## Commit message format

Use conventional commits with an imperative title and detailed body.

```text
<type>(<scope>): <imperative summary ≤72 chars>

<why this change exists; include deliberate scope boundaries>

path/or/area:
- what changed and why

path/file.py — SymbolName:
- what changed and why

Version-Bump: X.Y.Z → X.Y.(Z+1)
```

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `style`, `perf`, `test`, `deps`, `remove`.

Preferred scopes: `cli`, `extension`, `schema`, `ai`, `vault`, `capture`, `ui`, `config`, `ci`, `docs`, `deps`.

### Body rules

- Title says what; body explains why and the touched areas.
- Use `path/or/area:` or `path/file — Symbol:` headers.
- Bullets start with `- `.
- Wrapped bullet continuations use four spaces.
- Mention the rebuild phase in the opening paragraph when useful.
- Put metadata in the body, not `git commit --trailer`.

### Footer

- Versioned commit: `Version-Bump: 0.3.0 → 0.3.1`
- Cherry-pick: add `Cherry-picked-from: <short-hash>` before `Version-Bump`
- Skipped bump: explain why in the body; omit `Version-Bump`

See [examples.md](examples.md).

## Creating the commit

Pass multi-line messages with the shell's here-document/here-string mechanism. On PowerShell:

```powershell
$message = @'
feat(scope): summary

Body...

Version-Bump: 0.3.0 → 0.3.1
'@
git commit -m $message
```

Do not squeeze detailed messages into fragile escaped one-liners.

## Amend policy

Avoid amend. Amend only when all are true:

1. The user explicitly asked, or a successful commit hook modified files that belong in the commit.
2. The commit was created by this agent in the current conversation.
3. It has not been pushed.

If a commit failed or was rejected by a hook, fix the issue and create a normal commit—never amend a failed commit.

## Cherry-picks

Use `git cherry-pick --no-commit <hash>`, resolve and verify, then run the normal per-commit sequence. Include:

```text
Cherry-picked-from: abc1234
Version-Bump: X.Y.Z → X.Y.(Z+1)
```

## If the user did not ask to commit

Return:

````markdown
### Commit 1: <title>

git add path1 path2

Message:
```text
<full message>
```
````

## Splitting a messy tree

1. Identify coupling by feature, phase, and contract.
2. Order foundation → shared contract → implementation → verification/docs.
3. Use path-specific staging or `git add -p`; avoid `git add -A` unless the entire tree is one logical commit.
4. Give each commit its own version/sync/check cycle after canonical packaging exists.
5. Leave unrelated pre-existing changes untouched.
