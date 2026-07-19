"""Batch provider and explicit apply tests."""

import json
from pathlib import Path
from uuid import UUID

import httpx
import pytest

from tabman.models import Proposal, ProposalItem, ProposalStatus
from tabman.organize import (
    DeterministicProvider,
    MistralProvider,
    OrganizeError,
    apply_proposal,
    create_proposal,
)
from tabman.vault import read_document

FIXTURE = (
    Path(__file__).parents[1]
    / "packages"
    / "schema"
    / "fixtures"
    / "collection.v1.json"
)


def test_deterministic_batch_does_not_mutate_until_apply() -> None:
    document = read_document(FIXTURE)

    proposal = create_proposal(
        document,
        DeterministicProvider(),
        include_full_url=False,
    )

    assert proposal.status == "preview"
    assert document.collections[0].name == "Research"
    applied = apply_proposal(document, proposal)
    assert proposal.status == "preview"
    assert applied.proposals[-1].status == "applied"
    assert {item.name for item in applied.collections} == {
        "developer.chrome.com",
        "wxt.dev",
        "Research",
    }
    assert (
        next(item for item in applied.collections if item.name == "Research").tabs == ()
    )


def test_mistral_uses_base_url_header_and_one_batch_request() -> None:
    document = read_document(FIXTURE)
    requests: list[httpx.Request] = []
    response_items = [
        {
            "tabId": str(tab.id),
            "collectionName": "Research",
            "tags": ["browser"],
        }
        for collection in document.collections
        for tab in collection.tabs
    ]

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        prompt = json.loads(request.content)["messages"][0]["content"]
        assert '"hostname":"wxt.dev"' in prompt
        assert '"url":' not in prompt
        return httpx.Response(
            200,
            json={
                "choices": [
                    {"message": {"content": json.dumps({"items": response_items})}}
                ]
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        provider = MistralProvider(
            "secret-value",
            base_url="https://mistral.example/v1",
            client=client,
        )
        proposal = create_proposal(
            document,
            provider,
            include_full_url=False,
        )

    assert len(proposal.items) == 2
    assert len(requests) == 1
    assert str(requests[0].url) == "https://mistral.example/v1/chat/completions"
    assert requests[0].headers["authorization"] == "Bearer secret-value"
    assert "secret-value" not in str(requests[0].url)


def test_provider_must_map_every_tab() -> None:
    document = read_document(FIXTURE)

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "items": [
                                        {
                                            "tabId": str(
                                                document.collections[0].tabs[0].id
                                            ),
                                            "collectionName": "Only one",
                                            "tags": [],
                                        }
                                    ]
                                }
                            )
                        }
                    }
                ]
            },
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        provider = MistralProvider(
            "secret",
            base_url="https://mistral.example/v1",
            client=client,
        )
        with pytest.raises(OrganizeError, match="every input"):
            create_proposal(document, provider, include_full_url=False)


def test_provider_rejects_insecure_remote_base_url() -> None:
    with pytest.raises(OrganizeError, match="HTTPS"):
        MistralProvider("secret", base_url="http://mistral.example/v1")


def test_apply_preserves_empty_collections() -> None:
    document = read_document(FIXTURE)
    empty = document.collections[0].model_copy(
        update={
            "id": UUID("10000000-0000-4000-8000-000000000099"),
            "name": "KeepMeEmpty",
            "tabs": (),
            "tags": (),
        }
    )
    document = document.model_copy(
        update={"collections": (*document.collections, empty)}
    )
    proposal = create_proposal(
        document,
        DeterministicProvider(),
        include_full_url=False,
    )

    applied = apply_proposal(document, proposal)

    assert "KeepMeEmpty" in {item.name for item in applied.collections}
    assert (
        next(item for item in applied.collections if item.name == "KeepMeEmpty").tabs
        == ()
    )


def test_apply_normalizes_case_variants_without_duplicate_ids() -> None:
    document = read_document(FIXTURE)
    tabs = document.collections[0].tabs
    proposal = Proposal(
        id=UUID("60000000-0000-4000-8000-000000000001"),
        created_at="2026-07-19T10:00:00Z",
        provider="test",
        status=ProposalStatus.PREVIEW,
        items=(
            ProposalItem(
                tab_id=tabs[0].id,
                collection_name="Research",
                tags=("AI",),
            ),
            ProposalItem(
                tab_id=tabs[1].id,
                collection_name="research",
                tags=("ai",),
            ),
        ),
    )

    applied = apply_proposal(document, proposal)

    assert len(applied.collections) == 1
    assert len(applied.collections[0].tags) == 1
    assert {tab.tag_ids for tab in applied.collections[0].tabs} == {
        (applied.collections[0].tags[0].id,)
    }


def test_deterministic_provider_handles_blank_hostnames() -> None:
    document = read_document(FIXTURE)
    blank = (
        document.collections[0]
        .tabs[0]
        .model_copy(update={"url": "about:blank", "hostname": ""})
    )

    suggestions = DeterministicProvider().suggest((blank,), include_full_url=False)

    assert suggestions[0].collection_name == "about"
    assert suggestions[0].tags == ()
