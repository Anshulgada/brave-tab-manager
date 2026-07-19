"""SQLite vault and shared import/export tests."""

import json
from pathlib import Path
from uuid import UUID

import pytest
from pydantic import ValidationError

from tabman.models import ExportDocument
from tabman.vault import Vault, read_document, write_document

ROOT = Path(__file__).parents[1]
FIXTURE = ROOT / "packages" / "schema" / "fixtures" / "collection.v1.json"


def test_vault_import_is_idempotent_and_round_trips(tmp_path: Path) -> None:
    source = read_document(FIXTURE)
    vault = Vault(tmp_path / "vault.sqlite3")

    vault.import_document(source)
    vault.import_document(source)
    exported = vault.export_document()

    assert vault.counts() == {"collections": 1, "sessions": 1, "proposals": 1}
    assert exported.collections == source.collections
    assert exported.sessions == source.sessions
    assert exported.proposals == source.proposals
    assert exported.settings == source.settings


def test_vault_search_uses_domain_boundaries(tmp_path: Path) -> None:
    vault = Vault(tmp_path / "vault.sqlite3")
    vault.import_document(read_document(FIXTURE))

    assert len(vault.search_tabs(hostname="chrome.com")) == 1
    assert len(vault.search_tabs(hostname="developer.chrome.com")) == 1
    assert vault.search_tabs(hostname="evilchrome.com") == []
    assert [tab.title for _, tab in vault.search_tabs("WXT")] == ["WXT"]


def test_json_and_markdown_exports_are_not_vault_storage(tmp_path: Path) -> None:
    vault = Vault(tmp_path / "vault.sqlite3")
    vault.import_document(read_document(FIXTURE))
    json_path = tmp_path / "export.json"
    markdown_path = tmp_path / "export.md"

    write_document(json_path, vault.export_document())
    vault.write_markdown(markdown_path)

    assert ExportDocument.model_validate_json(json_path.read_text()) is not None
    assert "[WXT](https://wxt.dev/)" in markdown_path.read_text(encoding="utf-8")
    assert json.loads(json_path.read_text())["schemaVersion"] == 1


def test_replace_rolls_back_if_serialization_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = read_document(FIXTURE)
    vault = Vault(tmp_path / "vault.sqlite3")
    vault.import_document(source)

    def fail_serialization(*_: object) -> str:
        raise RuntimeError("simulated serialization failure")

    monkeypatch.setattr(Vault, "_json", fail_serialization)
    with pytest.raises(RuntimeError, match="simulated"):
        vault.import_document(source, replace=True)

    monkeypatch.undo()
    assert vault.export_document().collections == source.collections


def test_vault_revalidates_copied_documents_before_writing(tmp_path: Path) -> None:
    source = read_document(FIXTURE)
    vault = Vault(tmp_path / "vault.sqlite3")
    vault.import_document(source)
    invalid_copy = source.model_copy(
        update={"collections": (source.collections[0], source.collections[0])}
    )

    with pytest.raises(ValidationError, match="collection IDs"):
        vault.import_document(invalid_copy, replace=True)

    assert vault.counts()["collections"] == 1


def test_merge_rejects_tab_ids_owned_by_another_collection(tmp_path: Path) -> None:
    source = read_document(FIXTURE)
    vault = Vault(tmp_path / "vault.sqlite3")
    vault.import_document(source)
    stolen_tab = source.collections[0].tabs[0].model_copy(update={"tag_ids": ()})
    collision = source.model_copy(
        update={
            "collections": (
                source.collections[0].model_copy(
                    update={
                        "id": UUID("10000000-0000-4000-8000-000000000088"),
                        "name": "Collision",
                        "tabs": (stolen_tab,),
                        "tags": (),
                    }
                ),
            ),
            "sessions": (),
            "proposals": (),
        }
    )

    with pytest.raises(ValueError, match="already belongs to another collection"):
        vault.import_document(collision)

    assert vault.export_document().collections == source.collections


def test_legacy_replace_preserves_existing_settings(tmp_path: Path) -> None:
    source = read_document(FIXTURE)
    vault = Vault(tmp_path / "vault.sqlite3")
    vault.import_document(source)
    custom = source.settings.model_copy(update={"theme": "dark"})
    vault.import_document(
        source.model_copy(update={"settings": custom}),
        replace=True,
        write_settings=True,
    )
    vault.import_document(source, replace=True, write_settings=False)

    assert vault.export_document().settings.theme == "dark"
