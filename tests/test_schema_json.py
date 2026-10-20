"""JSON Schema contract tests for the shared interchange document."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

ROOT = Path(__file__).parents[1]
SCHEMA = ROOT / "packages" / "schema" / "tabman.schema.json"
FIXTURE = ROOT / "packages" / "schema" / "fixtures" / "collection.v1.json"


@pytest.fixture(scope="module")
def validator() -> Draft202012Validator:
    return Draft202012Validator(json.loads(SCHEMA.read_text(encoding="utf-8")))


def test_shared_fixture_satisfies_json_schema(
    validator: Draft202012Validator,
) -> None:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    validator.validate(document)


def test_json_schema_rejects_unknown_fields(
    validator: Draft202012Validator,
) -> None:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    document["unexpected"] = True
    assert not validator.is_valid(document)


def test_json_schema_rejects_javascript_urls(
    validator: Draft202012Validator,
) -> None:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    document["collections"][0]["tabs"][0]["url"] = "javascript:alert(1)"
    assert not validator.is_valid(document)


def test_json_schema_rejects_credentialed_urls(
    validator: Draft202012Validator,
) -> None:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    credentialed = (
        "https://user:unused@developer.chrome.com/docs/"  # pragma: allowlist secret
    )
    document["collections"][0]["tabs"][0]["url"] = credentialed
    assert not validator.is_valid(document)


def test_json_schema_rejects_empty_ai_provider(
    validator: Draft202012Validator,
) -> None:
    document = json.loads(FIXTURE.read_text(encoding="utf-8"))
    document["settings"]["aiProvider"] = ""
    assert not validator.is_valid(document)
