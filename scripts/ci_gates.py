"""Run path-filtered pre-commit gates for the Python and extension stacks.

The gates mirror the continuous integration jobs, so a branch is verified the
same way it will be verified on main without spending any runner minutes.
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import rich_click as click

from tabman.theme import CONTEXT_SETTINGS, apply_theme

ROOT = Path(__file__).resolve().parents[1]
ZERO_REF = "0" * 40

apply_theme()


def _git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def changed_paths(check_all: bool, filenames: tuple[str, ...] = ()) -> set[str]:
    """Return repository-relative paths included in the commit or push."""
    if check_all:
        return {"pyproject.toml", "extension/package.json", "packages/schema/"}

    paths = {path.replace("\\", "/") for path in filenames if path}
    # Include staged changes and staged deletions
    try:
        staged_output = _git("diff", "--cached", "--name-only")
        staged = {
            path.replace("\\", "/") for path in staged_output.splitlines() if path
        }
        paths.update(staged)
    except Exception:
        pass

    if paths:
        return paths

    from_ref = os.environ.get("PRE_COMMIT_FROM_REF", "")
    if not from_ref or from_ref == ZERO_REF:
        try:
            from_ref = _git("merge-base", "HEAD", "origin/main")
        except Exception:
            from_ref = "HEAD~1"

    try:
        output = _git("diff", "--name-only", f"{from_ref}..HEAD")
        paths = {path.replace("\\", "/") for path in output.splitlines() if path}
        if paths:
            return paths
    except Exception:
        pass

    # If git cannot determine changed scope, safely run all gates
    return {"pyproject.toml", "extension/package.json", "packages/schema/"}


def _matches(paths: set[str], prefixes: tuple[str, ...]) -> bool:
    return any(
        path == prefix or path.startswith(prefix)
        for path in paths
        for prefix in prefixes
    )


def _run(command: list[str], cwd: Path = ROOT) -> None:
    subprocess.run(command, cwd=cwd, check=True)


@click.command(context_settings=CONTEXT_SETTINGS)
@click.option(
    "--all",
    "check_all",
    is_flag=True,
    help="Run every gate instead of only the ones for the changed paths.",
)
@click.argument("filenames", nargs=-1, type=click.Path())
def main(check_all: bool, filenames: tuple[str, ...]) -> None:
    """Run the pre-commit gates for the paths in the outgoing commit."""
    paths = changed_paths(check_all, filenames)
    python_changed = _matches(
        paths,
        (
            "pyproject.toml",
            "uv.lock",
            "src/",
            "tests/",
            "scripts/",
            "packages/schema/",
        ),
    )
    extension_changed = _matches(
        paths,
        (
            "extension/",
            "packages/schema/",
        ),
    )

    local_ci = [sys.executable, str(ROOT / "scripts" / "ci_local.py")]
    if python_changed:
        _run([*local_ci, "python"])
    if extension_changed:
        _run([*local_ci, "extension"])


if __name__ == "__main__":
    main()
