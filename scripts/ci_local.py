"""Run the repository checks locally, mirroring the continuous integration jobs.

The GitHub workflow only runs when a commit lands on main, so every branch
needs a fast local gate. This script runs the same commands, in the same
order, with the same tools, and prints a short summary at the end.

Usage:
    uv run python scripts/ci_local.py              # both stacks
    uv run python scripts/ci_local.py python
    uv run python scripts/ci_local.py extension
    uv run python scripts/ci_local.py changed      # only what you touched
    uv run python scripts/ci_local.py act          # also run the real workflow
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import rich_click as click

from tabman.theme import CONTEXT_SETTINGS, apply_theme

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"

apply_theme()

PYTHON_STEPS: tuple[tuple[str, ...], ...] = (
    ("uv", "sync", "--locked"),
    ("uv", "run", "python", "scripts/check_versions.py"),
    ("uv", "run", "ruff", "check", "."),
    ("uv", "run", "ruff", "format", "--check", "."),
    ("uv", "run", "ty", "check"),
    ("uv", "run", "pytest"),
    ("uv", "run", "bandit", "-q", "-r", "src"),
    (
        "uv",
        "run",
        "zizmor",
        "--persona=regular",
        "--min-severity=low",
        ".github/workflows",
    ),
)

EXTENSION_STEPS: tuple[tuple[str, ...], ...] = (
    ("bun", "install", "--frozen-lockfile"),
    ("bun", "run", "check"),
    ("bun", "run", "typecheck"),
    ("bun", "run", "test"),
    ("bun", "run", "build"),
    ("bun", "run", "zip"),
)

PYTHON_PATHS = ("src/", "tests/", "scripts/", "packages/schema/", "pyproject.toml")
EXTENSION_PATHS = ("extension/", "packages/schema/")


def _run(command: tuple[str, ...], cwd: Path) -> tuple[bool, str]:
    printable = " ".join(command)
    print(f"\n==> {printable}", flush=True)
    result = subprocess.run(command, cwd=cwd, check=False)
    return result.returncode == 0, printable


def _changed_paths() -> set[str]:
    """Return the paths that differ from the merge base with main."""
    base = subprocess.run(
        ["git", "merge-base", "HEAD", "origin/main"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    reference = base.stdout.strip() or "HEAD"
    diff = subprocess.run(
        ["git", "diff", "--name-only", f"{reference}..HEAD"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    return {line.replace("\\", "/") for line in diff.stdout.splitlines() if line}


def _matches(paths: set[str], prefixes: tuple[str, ...]) -> bool:
    return any(
        path == prefix or path.startswith(prefix)
        for path in paths
        for prefix in prefixes
    )


def _run_actionlint() -> tuple[bool, str]:
    """Run actionlint on the workflow files, when it is installed."""
    if shutil.which("actionlint") is None:
        print(
            "actionlint is not installed, skipping the workflow lint.\n"
            "  winget install rhysd.actionlint   (Windows)\n"
            "  brew install actionlint            (macOS)\n"
            "  go install github.com/rhysd/actionlint/cmd/actionlint@latest",
            file=sys.stderr,
        )
        return True, "act (not installed, skipped)"
    return _run(("actionlint",), ROOT)


def _run_act() -> tuple[bool, str]:
    """Run the real workflow file locally with act, when it is installed."""
    if shutil.which("act") is None:
        print(
            "act is not installed. See the local CI section in the README:\n"
            "  winget install nektos.act   (Windows)\n"
            "  brew install act             (macOS)\n"
            "  sudo apt install act        (Debian and Ubuntu)",
            file=sys.stderr,
        )
        return False, "act"
    return _run(("act", "-W", ".github/workflows/ci.yml"), ROOT)


def _run_checks(*, python: bool, extension: bool, act: bool = False) -> int:
    """Run the selected checks and report the result."""
    results: list[tuple[bool, str]] = []
    if python:
        for step in PYTHON_STEPS:
            results.append(_run(step, ROOT))
        results.append(_run_actionlint())
    if extension:
        for step in EXTENSION_STEPS:
            results.append(_run(step, EXTENSION))
    if act:
        results.append(_run_act())

    print("\n== summary ==")
    for passed, label in results:
        print(f"  {'PASS' if passed else 'FAIL'}  {label}")
    failed = [label for passed, label in results if not passed]
    if failed:
        print(f"\n{len(failed)} step(s) failed.")
        return 1
    print("\nall checks passed")
    return 0


@click.group(
    context_settings=CONTEXT_SETTINGS,
    invoke_without_command=True,
)
@click.option(
    "--only",
    type=click.Choice(["all", "python", "extension", "changed"], case_sensitive=False),
    default="all",
    show_default=True,
    help="Which stack to check.",
)
@click.option(
    "--changed",
    is_flag=True,
    help="Check only the stacks that differ from main.",
)
@click.option(
    "--act",
    is_flag=True,
    help="Also run the GitHub workflow locally with act.",
)
@click.pass_context
def cli(
    ctx: click.Context,
    only: str,
    changed: bool,
    act: bool,
) -> None:
    """Run the repository checks locally, mirroring the CI jobs."""
    ctx.ensure_object(dict)
    ctx.obj["only"] = only
    ctx.obj["changed"] = changed
    ctx.obj["act"] = act
    if ctx.invoked_subcommand is None:
        ctx.exit(_default_run(ctx))


def _selection(ctx: click.Context) -> tuple[bool, bool, bool]:
    options = ctx.obj if isinstance(ctx.obj, dict) else {}
    only = str(options.get("only", "all"))
    want_changed = bool(options.get("changed")) or only == "changed"
    want_act = bool(options.get("act"))
    if want_changed:
        paths = _changed_paths()
        print(f"changed paths: {len(paths)}")
        return (
            _matches(paths, PYTHON_PATHS),
            _matches(paths, EXTENSION_PATHS),
            want_act,
        )
    return (only in {"all", "python"}, only in {"all", "extension"}, want_act)


def _default_run(ctx: click.Context) -> int:
    python, extension, act = _selection(ctx)
    return _run_checks(python=python, extension=extension, act=act)


@cli.command("python")
@click.pass_context
def python_command(ctx: click.Context) -> None:
    """Run the Python stack checks."""
    ctx.exit(_run_checks(python=True, extension=False))


@cli.command("extension")
@click.pass_context
def extension_command(ctx: click.Context) -> None:
    """Run the extension stack checks."""
    ctx.exit(_run_checks(python=False, extension=True))


@cli.command("changed")
@click.pass_context
def changed_command(ctx: click.Context) -> None:
    """Run the checks for the stacks that differ from main."""
    paths = _changed_paths()
    print(f"changed paths: {len(paths)}")
    ctx.exit(
        _run_checks(
            python=_matches(paths, PYTHON_PATHS),
            extension=_matches(paths, EXTENSION_PATHS),
        )
    )


@cli.command("act")
@click.pass_context
def act_command(ctx: click.Context) -> None:
    """Run the GitHub workflow locally with act."""
    ctx.exit(_run_checks(python=False, extension=False, act=True))


if __name__ == "__main__":
    cli()
