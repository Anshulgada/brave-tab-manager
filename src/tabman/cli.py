"""Command-line entry point for Tabman."""

from __future__ import annotations

import argparse
from collections.abc import Sequence

from tabman import __version__


def build_parser() -> argparse.ArgumentParser:
    """Build the root command parser."""
    parser = argparse.ArgumentParser(
        prog="tabman",
        description="Manage a local vault of Chromium tabs and collections.",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    """Run the Tabman CLI."""
    build_parser().parse_args(argv)
    return 0
