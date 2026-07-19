"""Smoke tests for the CLI scaffold."""

import pytest

from tabman import __version__
from tabman.cli import build_parser, main


def test_parser_identity() -> None:
    parser = build_parser()

    assert parser.prog == "tabman"
    assert parser.description is not None
    assert "local vault" in parser.description.lower()


def test_main_without_command() -> None:
    assert main([]) == 0


def test_version_uses_package_metadata(capsys: pytest.CaptureFixture[str]) -> None:
    with pytest.raises(SystemExit, match="0"):
        main(["--version"])

    assert capsys.readouterr().out.strip() == f"tabman {__version__}"
