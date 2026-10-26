# Contributing

Thanks for helping Tabman. It is a small project with a simple shape: a browser extension for the daily switchboard and library, and a Python CLI for the vault.

## Getting set up

```powershell
uv sync
cd extension
bun install
```

You need Python 3.14.6 (uv installs it), Node 24, Bun 1.4.3, and Brave or another Chromium browser 114 or newer.

## Before you open a pull request

Run the same gate the workflow runs:

```powershell
uv run python scripts\ci_local.py
```

That covers the Python tests, the lint, the type check, the security scans, the workflow audits, the extension checks, and the build. It is the same set of steps the CI runs on `main`.

## The rules this project follows

- **Local first.** No accounts, no servers, no telemetry, no page content.
- **Least privilege.** Every new browser permission needs a reason, and host permissions stay optional.
- **Secrets stay out of the repository and out of the command line.** Use the environment, the config directory, or an interactive prompt.
- **One logical change per commit**, with a conventional commit title and a body that explains why.
- **Version in one place.** The project version lives in `pyproject.toml`, and the extension mirrors it. `uv run python scripts/check_versions.py` checks that they agree.
- **Tests for the behaviour you change.** The Python suite runs without any live key.

## Branches and releases

- Work on a branch. `feat/rebuild` was the rebuild branch; new work gets its own branch.
- The workflow runs on `main`. Tag the release (`v0.4.0`) to publish to PyPI and to build the GitHub Release. The tag must match the project version.
- Update `CHANGELOG.md` in the last commit of a batch.

## Where things live

| Path               | What it holds                                                    |
| ------------------ | ---------------------------------------------------------------- |
| `src/tabman/`      | The Python CLI and the vault                                     |
| `tests/`           | The Python tests                                                 |
| `extension/`       | The WXT and React extension                                      |
| `packages/schema/` | The shared JSON contract between the two surfaces                |
| `scripts/`         | The installers, the local CI runner, and the tooling helpers     |
| `docs/`            | The rebuild plan, the research notes, and the architecture notes |

## Style

- Python: Ruff, 88 columns, type hints, docstrings that say why.
- TypeScript: Biome, strict types, no `any` without a comment that explains it.
- Comments explain the reason, not the mechanic.

## Reporting problems

Bugs and feature requests go in the issue tracker. Security problems follow [SECURITY.md](SECURITY.md).
