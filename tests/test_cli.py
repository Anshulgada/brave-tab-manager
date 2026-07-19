"""Offline command tests for the rebuilt CLI."""

import json
from pathlib import Path

from typer.testing import CliRunner

from tabman import __version__
from tabman.cli import app, main

ROOT = Path(__file__).parents[1]
FIXTURE = ROOT / "packages" / "schema" / "fixtures" / "collection.v1.json"


def invoke(*args: str):
    return CliRunner().invoke(app, list(args))


def test_help_lists_every_core_subcommand() -> None:
    result = invoke("--help")

    assert result.exit_code == 0
    for command in (
        "capture",
        "organize",
        "search",
        "export",
        "import",
        "config",
        "version",
    ):
        assert command in result.output


def test_main_without_command_returns_usage_error() -> None:
    assert main([]) == 2


def test_version_uses_package_metadata() -> None:
    result = invoke("--version")

    assert result.exit_code == 0
    assert result.output.strip() == __version__
    assert invoke("version").output.strip() == __version__


def test_offline_import_search_export_flow(tmp_path: Path) -> None:
    vault = tmp_path / "vault.sqlite3"
    exported = tmp_path / "export.json"

    imported = invoke("import", str(FIXTURE), "--vault", str(vault))
    searched = invoke(
        "search",
        "WXT",
        "--vault",
        str(vault),
        "--format",
        "json",
    )
    export_result = invoke(
        "export",
        str(exported),
        "--vault",
        str(vault),
    )

    assert imported.exit_code == 0, imported.output
    assert searched.exit_code == 0, searched.output
    assert json.loads(searched.output)[0]["hostname"] == "wxt.dev"
    assert export_result.exit_code == 0, export_result.output
    assert json.loads(exported.read_text())["schemaVersion"] == 1


def test_legacy_import_requires_explicit_flag(tmp_path: Path) -> None:
    legacy = ROOT / "packages" / "schema" / "fixtures" / "legacy-tabs.json"
    vault = tmp_path / "vault.sqlite3"

    rejected = invoke("import", str(legacy), "--vault", str(vault))
    accepted = invoke(
        "import",
        str(legacy),
        "--legacy",
        "--vault",
        str(vault),
    )

    assert rejected.exit_code == 2
    assert accepted.exit_code == 0, accepted.output


def test_deterministic_organize_previews_before_apply(tmp_path: Path) -> None:
    vault = tmp_path / "vault.sqlite3"
    assert invoke("import", str(FIXTURE), "--vault", str(vault)).exit_code == 0

    preview = invoke("organize", "--vault", str(vault))
    preview_export = invoke(
        "export",
        str(tmp_path / "preview.json"),
        "--vault",
        str(vault),
    )
    applied = invoke("organize", "--vault", str(vault), "--apply", "--yes")
    applied_export = invoke(
        "export",
        str(tmp_path / "applied.json"),
        "--vault",
        str(vault),
    )

    assert preview.exit_code == 0, preview.output
    assert "Preview only" in preview.output
    assert preview_export.exit_code == 0
    assert {
        item["name"]
        for item in json.loads((tmp_path / "preview.json").read_text())["collections"]
    } == {"Research"}
    assert applied.exit_code == 0, applied.output
    assert "Applied proposal" in applied.output
    assert applied_export.exit_code == 0
    assert {
        item["name"]
        for item in json.loads((tmp_path / "applied.json").read_text())["collections"]
    } == {"developer.chrome.com", "wxt.dev", "Research"}
