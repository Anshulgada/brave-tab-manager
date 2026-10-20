"""Verify that release surfaces mirror the canonical project version."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    """Fail when the extension version differs from root project metadata."""
    with (ROOT / "pyproject.toml").open("rb") as pyproject_file:
        canonical_version = tomllib.load(pyproject_file)["project"]["version"]

    package = json.loads((ROOT / "extension" / "package.json").read_text("utf-8"))
    extension_version = package["version"]

    if extension_version != canonical_version:
        message = (
            "Version mismatch: pyproject.toml="
            f"{canonical_version}, extension/package.json={extension_version}"
        )
        raise SystemExit(message)

    print(f"Tabman version {canonical_version} is synchronized.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
