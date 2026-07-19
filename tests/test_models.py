"""Contract tests for the Python shared-schema mirror."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from tabman.models import ExportDocument

FIXTURE = (
    Path(__file__).parents[1]
    / "packages"
    / "schema"
    / "fixtures"
    / "collection.v1.json"
)


def test_shared_fixture_round_trips_through_pydantic() -> None:
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))

    document = ExportDocument.model_validate(source)
    exported = json.loads(document.to_json())

    assert ExportDocument.model_validate(exported) == document
    assert exported["schemaVersion"] == 1
    assert exported["collections"][0]["tabs"][0]["hostname"] == "developer.chrome.com"


def test_contract_rejects_unknown_fields() -> None:
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    source["unexpected"] = True

    with pytest.raises(ValidationError, match="unexpected"):
        ExportDocument.model_validate(source)


def test_contract_rejects_dangling_tag_reference() -> None:
    source = json.loads(FIXTURE.read_text(encoding="utf-8"))
    source["collections"][0]["tabs"][0]["tagIds"] = [
        "90000000-0000-4000-8000-000000000001"
    ]

    with pytest.raises(ValidationError, match="outside its collection"):
        ExportDocument.model_validate(source)
