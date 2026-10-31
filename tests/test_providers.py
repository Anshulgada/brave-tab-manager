"""Tests for the OpenAI- and Anthropic-compatible provider adapters."""

import json
from pathlib import Path
from typing import Any

import httpx
import pytest

from tabman.config import ApiFormat, ProviderProfile
from tabman.errors import OrganizeError
from tabman.models import Tab
from tabman.providers import (
    AnthropicCompatibleProvider,
    OllamaProvider,
    OpenAICompatibleProvider,
    OpenAIResponsesProvider,
    extract_json_payload,
    provider_for_profile,
)
from tabman.vault import read_document

FIXTURE = (
    Path(__file__).parents[1]
    / "packages"
    / "schema"
    / "fixtures"
    / "collection.v1.json"
)


def fixture_tabs() -> tuple[Tab, ...]:
    document = read_document(FIXTURE)
    return tuple(tab for collection in document.collections for tab in collection.tabs)


def batch_payload(tabs: tuple[Tab, ...]) -> dict[str, Any]:
    return {
        "items": [
            {"tabId": str(tab.id), "collectionName": "Research", "tags": ["docs"]}
            for tab in tabs
        ]
    }


def mock_client(handler: Any, captured: dict[str, Any]) -> httpx.Client:
    def wrapped(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        return handler(request)

    return httpx.Client(transport=httpx.MockTransport(wrapped))


def test_openai_provider_posts_the_expected_request() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": json.dumps(batch_payload(tabs))}}]
            },
        )

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    suggestions = provider.suggest(tabs, include_full_url=False)

    assert captured["url"] == "https://api.example/v1/chat/completions"
    assert captured["headers"]["authorization"] == "Bearer secret-key"
    assert captured["body"]["model"] == "gpt-test"
    assert captured["body"]["messages"][0]["role"] == "user"
    assert "url" not in captured["body"]["messages"][0]["content"]
    assert len(suggestions) == len(tabs)
    assert suggestions[0].collection_name == "Research"


def test_openai_provider_sends_full_urls_only_when_requested() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": json.dumps(batch_payload(tabs))}}]
            },
        )

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    provider.suggest(tabs, include_full_url=True)

    assert (
        "developer.chrome.com/docs/extensions/"
        in captured["body"]["messages"][0]["content"]
    )


def test_openai_provider_accepts_fenced_json() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}
    fenced = f"```json\n{json.dumps(batch_payload(tabs))}\n```"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": fenced}}]})

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    assert len(provider.suggest(tabs, include_full_url=False)) == len(tabs)


def test_openai_provider_accepts_content_parts() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}
    parts = [{"type": "text", "text": json.dumps(batch_payload(tabs))}]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": parts}}]})

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    assert len(provider.suggest(tabs, include_full_url=False)) == len(tabs)


def test_responses_provider_posts_the_expected_request() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(batch_payload(tabs)),
                            }
                        ],
                    }
                ]
            },
        )

    provider = OpenAIResponsesProvider(
        "secret-key",
        base_url="https://api.openai.com/v1",
        model="gpt-6-luna",
        client=mock_client(handler, captured),
    )

    suggestions = provider.suggest(tabs, include_full_url=False)

    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["headers"]["authorization"] == "Bearer secret-key"
    assert captured["body"]["model"] == "gpt-6-luna"
    assert "wxt.dev" in captured["body"]["input"]
    assert len(suggestions) == len(tabs)


def test_responses_provider_adds_the_v1_path_when_needed() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"output_text": json.dumps(batch_payload(tabs))}
        )

    provider = OpenAIResponsesProvider(
        "secret-key",
        base_url="https://api.openai.com",
        model="gpt-6-luna",
        client=mock_client(handler, captured),
    )

    provider.suggest(tabs, include_full_url=False)

    assert captured["url"] == "https://api.openai.com/v1/responses"


def test_responses_provider_accepts_a_top_level_output_text() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"output_text": json.dumps(batch_payload(tabs))}
        )

    provider = OpenAIResponsesProvider(
        "secret-key",
        base_url="https://api.openai.com/v1",
        model="gpt-6-luna",
        client=mock_client(handler, captured),
    )

    assert len(provider.suggest(tabs, include_full_url=False)) == len(tabs)


def test_responses_provider_reports_a_missing_text_payload() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"output": []})

    provider = OpenAIResponsesProvider(
        "secret-key",
        base_url="https://api.openai.com/v1",
        model="gpt-6-luna",
        client=mock_client(handler, captured),
    )

    with pytest.raises(OrganizeError, match="did not include any text"):
        provider.suggest(tabs, include_full_url=False)


def test_anthropic_provider_posts_the_expected_request() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": json.dumps(batch_payload(tabs))}]
            },
        )

    provider = AnthropicCompatibleProvider(
        "secret-key",
        base_url="https://api.anthropic.com",
        model="claude-test",
        client=mock_client(handler, captured),
    )

    suggestions = provider.suggest(tabs, include_full_url=False)

    assert captured["url"] == "https://api.anthropic.com/v1/messages"
    assert captured["headers"]["x-api-key"] == "secret-key"
    assert captured["headers"]["anthropic-version"] == "2023-06-01"
    assert captured["body"]["model"] == "claude-test"
    assert captured["body"]["max_tokens"] > 0
    assert len(suggestions) == len(tabs)


def test_anthropic_provider_keeps_a_v1_base_url() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "content": [{"type": "text", "text": json.dumps(batch_payload(tabs))}]
            },
        )

    provider = AnthropicCompatibleProvider(
        "secret-key",
        base_url="https://gateway.example/v1",
        model="claude-test",
        client=mock_client(handler, captured),
    )

    provider.suggest(tabs, include_full_url=False)

    assert captured["url"] == "https://gateway.example/v1/messages"


def test_provider_reports_http_failures() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream unavailable")

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    with pytest.raises(OrganizeError, match="HTTP 503"):
        provider.suggest(tabs, include_full_url=False)


def test_provider_reports_invalid_json() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="not json at all")

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    with pytest.raises(OrganizeError):
        provider.suggest(tabs, include_full_url=False)


def test_provider_requires_every_tab_exactly_once() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}
    partial = {"items": [{"tabId": str(tabs[0].id), "collectionName": "Only"}]}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"choices": [{"message": {"content": json.dumps(partial)}}]}
        )

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    with pytest.raises(OrganizeError, match="exactly once"):
        provider.suggest(tabs, include_full_url=False)


def test_provider_rejects_blank_collection_names() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}
    blank = {
        "items": [
            {"tabId": str(tab.id), "collectionName": "  ", "tags": []} for tab in tabs
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200, json={"choices": [{"message": {"content": json.dumps(blank)}}]}
        )

    provider = OpenAICompatibleProvider(
        "secret-key",
        base_url="https://api.example/v1",
        model="gpt-test",
        client=mock_client(handler, captured),
    )

    with pytest.raises(OrganizeError, match="blank collection name"):
        provider.suggest(tabs, include_full_url=False)


def test_provider_rejects_insecure_remote_base_url() -> None:
    with pytest.raises(OrganizeError, match="HTTPS"):
        OpenAICompatibleProvider(
            "secret-key", base_url="http://api.example/v1", model="gpt-test"
        )


def test_provider_allows_local_http_base_url() -> None:
    provider = OpenAICompatibleProvider(
        "secret-key", base_url="http://127.0.0.1:11434/v1", model="llama"
    )

    assert provider.base_url == "http://127.0.0.1:11434/v1"


def test_extract_json_payload_finds_json_inside_prose() -> None:
    payload = extract_json_payload('Sure! {"items": [1]} - hope that helps')

    assert payload == {"items": [1]}


def test_extract_json_payload_rejects_non_json() -> None:
    with pytest.raises(OrganizeError, match="not JSON"):
        extract_json_payload("there is no json here")


def test_provider_for_profile_selects_the_matching_adapter() -> None:
    openai_profile = ProviderProfile(
        name="gateway",
        base_url="https://api.example/v1",
        model="gpt-test",
        api_format=ApiFormat.OPENAI,
    )
    responses_profile = ProviderProfile(
        name="gateway",
        base_url="https://api.example/v1",
        model="gpt-test",
        api_format=ApiFormat.RESPONSES,
    )
    anthropic_profile = ProviderProfile(
        name="gateway",
        base_url="https://api.example",
        model="claude-test",
        api_format=ApiFormat.ANTHROPIC,
    )

    assert isinstance(
        provider_for_profile(openai_profile, "key"), OpenAICompatibleProvider
    )
    assert isinstance(
        provider_for_profile(responses_profile, "key"), OpenAIResponsesProvider
    )
    assert isinstance(
        provider_for_profile(anthropic_profile, "key"), AnthropicCompatibleProvider
    )

    ollama_profile = ProviderProfile(
        name="local-ollama",
        base_url="http://localhost:11434",
        model="gemma2:9b",
        api_format=ApiFormat.OLLAMA,
    )
    assert isinstance(provider_for_profile(ollama_profile), OllamaProvider)


def test_ollama_provider_posts_the_expected_request() -> None:
    tabs = fixture_tabs()
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "message": {
                    "role": "assistant",
                    "content": json.dumps(batch_payload(tabs)),
                }
            },
        )

    provider = OllamaProvider(
        base_url="http://localhost:11434",
        model="embeddinggemma-2",
        client=mock_client(handler, captured),
    )
    suggestions = provider.organize(tabs, include_full_url=False)

    assert len(suggestions) == len(tabs)
    assert captured["url"] == "http://localhost:11434/api/chat"
    assert captured["body"]["model"] == "embeddinggemma-2"
    assert captured["body"]["format"] == "json"
    assert captured["body"]["stream"] is False
    assert captured["body"]["options"] == {"temperature": 0.0}
