"""Tests for guarded conversion of old Tabman data."""

import json
from pathlib import Path

import pytest

from tabman.legacy import LegacyImportError, import_legacy

FIXTURES = Path(__file__).parents[1] / "packages" / "schema" / "fixtures"


@pytest.mark.parametrize("name", ["legacy-tabs.json", "legacy-all-tabs.md"])
def test_legacy_formats_convert_without_modifying_source(name: str) -> None:
    path = FIXTURES / name
    before = path.read_bytes()

    document = import_legacy(path)

    assert path.read_bytes() == before
    assert {collection.name for collection in document.collections} == {
        "Coding",
        "Research",
    }
    assert sum(len(collection.tabs) for collection in document.collections) == 2


def test_legacy_import_is_deterministic() -> None:
    path = FIXTURES / "legacy-tabs.json"

    first = import_legacy(path)
    second = import_legacy(path)

    assert first == second


def test_legacy_import_merges_case_variant_categories(tmp_path: Path) -> None:
    path = tmp_path / "tabs.json"
    path.write_text(
        """
[
  {"title":"One","url":"https://one.example/","main_category":"Work","tags":[]},
  {"title":"Two","url":"https://two.example/","main_category":"work","tags":[]}
]
""".strip(),
        encoding="utf-8",
    )

    document = import_legacy(path)

    assert len(document.collections) == 1
    assert document.collections[0].name == "Work"
    assert len(document.collections[0].tabs) == 2


def test_legacy_import_rejects_credentialed_urls(tmp_path: Path) -> None:
    path = tmp_path / "tabs.json"
    secret_url = "https://user:unused@example.com/"  # pragma: allowlist secret
    path.write_text(
        json.dumps([{"title": "Secret", "url": secret_url, "tags": []}]),
        encoding="utf-8",
    )

    with pytest.raises(LegacyImportError, match="unsafe"):
        import_legacy(path)


def test_legacy_import_rejects_unsafe_urls(tmp_path: Path) -> None:
    path = tmp_path / "tabs.json"
    path.write_text(
        '[{"title":"Local file","url":"file:///secret","tags":[]}]',
        encoding="utf-8",
    )

    with pytest.raises(LegacyImportError, match="unsafe"):
        import_legacy(path)


def test_legacy_import_rejects_unrecognized_extensions(tmp_path: Path) -> None:
    path = tmp_path / "tabs.txt"
    path.write_text("nothing", encoding="utf-8")

    with pytest.raises(LegacyImportError, match="only"):
        import_legacy(path)


@pytest.mark.parametrize("name", ["tabs.json", "tabs.md"])
def test_legacy_import_reports_non_utf8_files(tmp_path: Path, name: str) -> None:
    path = tmp_path / name
    path.write_bytes(b"\xff\xfe\x00")

    with pytest.raises(LegacyImportError, match="cannot read"):
        import_legacy(path)
