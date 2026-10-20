"""Batch provider and explicit apply tests."""

import json
from pathlib import Path
from uuid import UUID

import httpx
import pytest

from tabman.config import ApiFormat, AppConfig, ProviderProfile
from tabman.models import CollectionStatus, Proposal, ProposalItem, ProposalStatus
from tabman.organize import (
    AnthropicCompatibleProvider,
    DeterministicProvider,
    MistralProvider,
    OpenAICompatibleProvider,
    OrganizeError,
    apply_proposal,
    build_provider,
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


def test_unsupported_provider_is_reported_before_secret_lookup(
    tmp_path: Path,
) -> None:
    config = AppConfig(vault_path=tmp_path / "vault.sqlite3")

    with pytest.raises(OrganizeError, match="unknown provider: nope"):
        build_provider("nope", config, prompt_for_secret=False)


def test_unknown_provider_lists_the_available_providers(tmp_path: Path) -> None:
    config = AppConfig(vault_path=tmp_path / "vault.sqlite3")

    with pytest.raises(OrganizeError) as error:
        build_provider("nope", config, prompt_for_secret=False)

    message = str(error.value)
    assert "deterministic" in message
    assert "openai" in message
    assert "anthropic" in message


def test_build_provider_uses_a_configured_profile(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    profile = ProviderProfile(
        name="Local Ollama",
        base_url="http://127.0.0.1:11434/v1",
        model="llama3.1",
    )
    config = AppConfig(vault_path=tmp_path / "vault.sqlite3", providers=(profile,))
    monkeypatch.setenv("TABMAN_LOCAL_OLLAMA_API_KEY", "key")

    provider = build_provider("local ollama", config, prompt_for_secret=False)

    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.model == "llama3.1"
    assert provider.base_url == "http://127.0.0.1:11434/v1"
    assert provider.name == "Local Ollama"


def test_build_provider_supports_anthropic_profiles(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    profile = ProviderProfile(
        name="Claude",
        base_url="https://api.anthropic.com",
        model="claude-test",
        api_format=ApiFormat.ANTHROPIC,
    )
    config = AppConfig(vault_path=tmp_path / "vault.sqlite3", providers=(profile,))
    monkeypatch.setenv("TABMAN_CLAUDE_API_KEY", "key")

    provider = build_provider("Claude", config, prompt_for_secret=False)

    assert isinstance(provider, AnthropicCompatibleProvider)
    assert provider.model == "claude-test"


def test_build_provider_accepts_a_one_off_base_url_and_model(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = AppConfig(vault_path=tmp_path / "vault.sqlite3")
    monkeypatch.setenv("TABMAN_AD_HOC_API_KEY", "key")

    provider = build_provider(
        "Ad Hoc",
        config,
        prompt_for_secret=False,
        base_url="https://api.example/v1",
        model="ad-hoc-model",
    )

    assert isinstance(provider, OpenAICompatibleProvider)
    assert provider.base_url == "https://api.example/v1"
    assert provider.model == "ad-hoc-model"


def test_build_provider_reports_a_missing_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    config = AppConfig(vault_path=tmp_path / "vault.sqlite3")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(OrganizeError, match="key is unavailable"):
        build_provider("openai", config, prompt_for_secret=False)


def test_deterministic_provider_keeps_long_hostnames_valid() -> None:
    document = read_document(FIXTURE)
    hostname = f"{'a' * 100}.{'b' * 100}.example"
    tab = (
        document.collections[0]
        .tabs[0]
        .model_copy(update={"url": f"https://{hostname}/", "hostname": hostname})
    )
    collection = document.collections[0].model_copy(update={"tabs": (tab,)})
    document = document.model_copy(update={"collections": (collection,)})

    proposal = create_proposal(
        document,
        DeterministicProvider(),
        include_full_url=False,
    )

    assert len(proposal.items) == 1
    assert len(proposal.items[0].collection_name) <= 120
    assert all(len(tag) <= 64 for tag in proposal.items[0].tags)


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


def test_apply_rejects_older_preview_proposals() -> None:
    document = read_document(FIXTURE)
    first = create_proposal(
        document,
        DeterministicProvider(),
        include_full_url=False,
    )
    second = create_proposal(
        document,
        DeterministicProvider(),
        include_full_url=False,
    )
    with_previews = document.model_copy(update={"proposals": (first, second)})

    applied = apply_proposal(with_previews, second)

    statuses = {item.id: item.status for item in applied.proposals}
    assert statuses[first.id] == ProposalStatus.REJECTED
    assert statuses[second.id] == ProposalStatus.APPLIED


def test_apply_does_not_bury_tabs_in_trashed_collections() -> None:
    document = read_document(FIXTURE)
    trashed = document.collections[0].model_copy(
        update={
            "id": UUID("10000000-0000-4000-8000-000000000099"),
            "name": "wxt.dev",
            "status": CollectionStatus.TRASHED,
            "tabs": (),
            "tags": (),
        }
    )
    document = document.model_copy(
        update={"collections": (*document.collections, trashed)}
    )
    proposal = create_proposal(
        document,
        DeterministicProvider(),
        include_full_url=False,
    )

    applied = apply_proposal(document, proposal)
    active = next(item for item in applied.collections if item.name == "wxt.dev")

    assert active.status == CollectionStatus.ACTIVE
    assert active.id != trashed.id
    assert any(
        item.id == trashed.id and item.status == CollectionStatus.TRASHED
        for item in applied.collections
    )
