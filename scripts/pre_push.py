"""Run path-filtered pre-push gates for the Python and extension stacks."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ZERO_REF = "0" * 40


def _git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def changed_paths(check_all: bool) -> set[str]:
    """Return repository-relative paths included in the push."""
    if check_all:
        return {"pyproject.toml", "extension/package.json", "packages/schema/"}

    from_ref = os.environ.get("PRE_COMMIT_FROM_REF", "")
    if not from_ref or from_ref == ZERO_REF:
        from_ref = _git("merge-base", "HEAD", "origin/main")

    output = _git("diff", "--name-only", f"{from_ref}..HEAD")
    return {path.replace("\\", "/") for path in output.splitlines() if path}


def _matches(paths: set[str], prefixes: tuple[str, ...]) -> bool:
    return any(
        path == prefix or path.startswith(prefix)
        for path in paths
        for prefix in prefixes
    )


def _run(command: list[str], cwd: Path = ROOT) -> None:
    subprocess.run(command, cwd=cwd, check=True)


def main() -> int:
    """Run only the gates affected by the outgoing paths."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Run every pre-push gate")
    args = parser.parse_args()

    paths = changed_paths(args.all)
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

    if python_changed:
        _run(["uv", "run", "pytest"])
    if extension_changed:
        _run(["bun", "run", "build"], ROOT / "extension")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
