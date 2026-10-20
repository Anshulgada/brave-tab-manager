"""Offline command tests for the rebuilt CLI."""

import json
from pathlib import Path
from typing import Any

import pytest
from click.testing import CliRunner

from tabman import __version__
from tabman.cli import app, main

ROOT = Path(__file__).parents[1]
FIXTURE = ROOT / "packages" / "schema" / "fixtures" / "collection.v1.json"


def invoke(*args: str):
    return CliRunner().invoke(app, list(args))


@pytest.fixture
def isolated_config(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point the CLI at a throwaway configuration directory."""
    monkeypatch.setattr("tabman.config.config_dir", lambda: tmp_path)
    return tmp_path


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


def test_search_human_output_uses_table_and_tsv(tmp_path: Path) -> None:
    vault = tmp_path / "vault.sqlite3"
    assert invoke("import", str(FIXTURE), "--vault", str(vault)).exit_code == 0

    table = invoke("search", "WXT", "--vault", str(vault))
    tsv = invoke("search", "WXT", "--vault", str(vault), "--format", "tsv")
    empty = invoke("search", "does-not-exist", "--vault", str(vault))

    assert table.exit_code == 0, table.output
    assert "Collection" in table.output
    assert "wxt.dev" in table.output
    assert tsv.output.startswith("COLLECTION\tTITLE\tHOSTNAME\tURL")
    assert "No matching tabs." in empty.output


def test_search_rejects_unknown_format() -> None:
    result = invoke("search", "anything", "--format", "yaml")

    assert result.exit_code == 2
    assert "format must be table, tsv, or json" in result.output


def test_search_reports_invalid_config(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_config() -> None:
        raise ValueError("bad config")

    monkeypatch.setattr("tabman.cli.load_config", fail_config)
    result = invoke("search", "anything")

    assert result.exit_code == 2
    assert "Error: bad config" in result.output


def test_corrupt_vault_reports_clean_error(tmp_path: Path) -> None:
    vault = tmp_path / "vault.sqlite3"
    vault.write_text("not a sqlite database", encoding="utf-8")

    result = invoke("search", "anything", "--vault", str(vault))

    assert result.exit_code == 2
    assert "Error:" in result.output
    assert "Traceback" not in result.output


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


def test_help_uses_styled_rounded_panels() -> None:
    result = invoke("--help")

    assert result.exit_code == 0
    assert "╭" in result.output
    assert "╰" in result.output
    assert "Options" in result.output


def test_search_results_are_rendered_in_a_styled_table(tmp_path: Path) -> None:
    vault = tmp_path / "vault.sqlite3"
    assert invoke("import", str(FIXTURE), "--vault", str(vault)).exit_code == 0

    result = invoke("search", "WXT", "--vault", str(vault))

    assert result.exit_code == 0, result.output
    assert "╭" in result.output
    assert "Matches" in result.output


def test_config_add_list_and_remove_provider(isolated_config: Path) -> None:
    added = invoke(
        "config",
        "add-provider",
        "Local Ollama",
        "--base-url",
        "http://127.0.0.1:11434/v1",
        "--model",
        "llama3.1",
    )
    listed = invoke("config", "list-providers", "--format", "json")

    assert added.exit_code == 0, added.output
    assert "Local Ollama" in added.output
    rows = json.loads(listed.output)
    assert any(row["name"] == "Local Ollama" for row in rows)
    assert any(row["name"] == "deterministic" for row in rows)

    removed = invoke("config", "remove-provider", "Local Ollama")
    after = json.loads(invoke("config", "list-providers", "--format", "json").output)

    assert removed.exit_code == 0, removed.output
    assert not any(row["name"] == "Local Ollama" for row in after)


def test_config_add_provider_rejects_duplicates_and_unsafe_urls(
    isolated_config: Path,
) -> None:
    first = invoke(
        "config",
        "add-provider",
        "Local Ollama",
        "--base-url",
        "http://127.0.0.1:11434/v1",
        "--model",
        "llama3.1",
    )
    duplicate = invoke(
        "config",
        "add-provider",
        "Local Ollama",
        "--base-url",
        "http://127.0.0.1:11434/v1",
        "--model",
        "llama3.1",
    )
    replaced = invoke(
        "config",
        "add-provider",
        "Local Ollama",
        "--base-url",
        "http://127.0.0.1:11434/v1",
        "--model",
        "llama3.2",
        "--replace",
    )
    unsafe = invoke(
        "config",
        "add-provider",
        "Remote",
        "--base-url",
        "http://api.example/v1",
        "--model",
        "m",
    )
    missing = invoke("config", "remove-provider", "Nope")

    assert first.exit_code == 0
    assert duplicate.exit_code == 2
    assert "provider already exists" in duplicate.output
    assert replaced.exit_code == 0, replaced.output
    assert unsafe.exit_code == 2
    assert "HTTPS" in unsafe.output
    assert missing.exit_code == 2
    assert "unknown provider" in missing.output


def test_config_set_rejects_an_unknown_default_provider(
    isolated_config: Path,
) -> None:
    result = invoke("config", "set", "--provider", "nope")

    assert result.exit_code == 2
    assert "unknown provider" in result.output
    assert "deterministic" in result.output


def test_config_set_key_stores_a_custom_provider_key(
    isolated_config: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    invoke(
        "config",
        "add-provider",
        "My Gateway",
        "--base-url",
        "https://api.example/v1",
        "--model",
        "m",
    )
    monkeypatch.setattr("tabman.cli.getpass.getpass", lambda prompt: "typed-secret")

    result = invoke("config", "set-key", "My Gateway")

    assert result.exit_code == 0, result.output
    assert (isolated_config / "secrets.env").read_text().strip() == (
        "TABMAN_MY_GATEWAY_API_KEY=typed-secret"
    )


def test_config_set_key_rejects_an_unknown_provider(isolated_config: Path) -> None:
    result = invoke("config", "set-key", "nope")

    assert result.exit_code == 2
    assert "unknown provider" in result.output


def test_organize_reports_unknown_providers_with_the_available_list(
    tmp_path: Path,
) -> None:
    vault = tmp_path / "vault.sqlite3"
    assert invoke("import", str(FIXTURE), "--vault", str(vault)).exit_code == 0

    result = invoke("organize", "--provider", "nope", "--vault", str(vault))

    assert result.exit_code == 2
    assert "unknown provider: nope" in result.output
    assert "deterministic" in result.output


def test_organize_uses_the_selected_provider(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    vault = tmp_path / "vault.sqlite3"
    assert invoke("import", str(FIXTURE), "--vault", str(vault)).exit_code == 0
    captured: dict[str, Any] = {}

    def fake_build_provider(name, config, **kwargs):
        captured["name"] = name
        captured["kwargs"] = kwargs
        raise RuntimeError("stop here")

    monkeypatch.setattr("tabman.organize.build_provider", fake_build_provider)

    result = invoke(
        "organize",
        "--provider",
        "My Gateway",
        "--vault",
        str(vault),
        "--base-url",
        "https://api.example/v1",
        "--model",
        "m",
    )

    assert result.exit_code == 2
    assert captured["name"] == "My Gateway"
    assert captured["kwargs"]["base_url"] == "https://api.example/v1"
    assert captured["kwargs"]["model"] == "m"
