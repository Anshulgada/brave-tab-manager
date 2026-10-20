"""OpenAI- and Anthropic-compatible organize providers.

The CLI used to ship hard-coded Gemini and Mistral clients. Both vendors
changed their free tiers, so Tabman now speaks the two widely supported
compatibility formats instead: OpenAI-style ``/chat/completions`` and
Anthropic-style ``/v1/messages``. Any local or hosted gateway that implements
one of those formats (OpenRouter, Groq, Together, Ollama, vLLM, LM Studio,
LiteLLM, ...) works without code changes.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field

from tabman.config import ApiFormat, ProviderProfile, validate_base_url
from tabman.errors import OrganizeError
from tabman.models import Tab

MAX_TOKENS = 4096
DEFAULT_TIMEOUT = 60.0
MAX_ERROR_DETAIL = 240


class Suggestion(BaseModel):
    """One tab mapped to a target collection and optional tags."""

    model_config = ConfigDict(extra="forbid")

    tab_id: UUID = Field(alias="tabId")
    collection_name: str = Field(alias="collectionName", min_length=1, max_length=120)
    tags: tuple[str, ...] = Field(default=(), max_length=12)


class SuggestionBatch(BaseModel):
    """A complete provider response."""

    model_config = ConfigDict(extra="forbid")

    items: tuple[Suggestion, ...]


def build_prompt(tabs: tuple[Tab, ...], *, include_full_url: bool) -> str:
    """Return the user prompt asking for one complete, JSON-only batch."""
    inputs = [
        {
            "tabId": str(tab.id),
            "title": tab.title,
            "hostname": tab.hostname,
            **({"url": tab.url} if include_full_url else {}),
        }
        for tab in tabs
    ]
    return (
        "Group every input tab into one concise collection and up to 12 tags. "
        'Return only JSON shaped {"items":[{"tabId":"uuid",'
        '"collectionName":"name","tags":["tag"]}]}. '
        f"Inputs: {json.dumps(inputs, separators=(',', ':'))}"
    )


def extract_json_payload(text: str) -> Any:
    """Pull a JSON document out of a model response.

    Providers wrap JSON in prose or Markdown fences even when asked not to, so
    the strictest possible parse is attempted first and a brace scan is used as
    a fallback.
    """
    candidate = text.strip()
    if candidate.startswith("```"):
        lines = candidate.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        candidate = "\n".join(lines).strip()
    try:
        return json.loads(candidate)
    except json.JSONDecodeError as error:
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start == -1 or end <= start:
            raise OrganizeError(f"provider response was not JSON: {error}") from error
        try:
            return json.loads(candidate[start : end + 1])
        except json.JSONDecodeError as inner:
            raise OrganizeError(f"provider response was not JSON: {inner}") from inner


def validate_complete_batch(
    payload: object, tabs: tuple[Tab, ...]
) -> tuple[Suggestion, ...]:
    """Validate that a provider mapped every tab exactly once."""
    batch = SuggestionBatch.model_validate(payload)
    expected = {tab.id for tab in tabs}
    actual = {item.tab_id for item in batch.items}
    if len(actual) != len(batch.items) or actual != expected:
        raise OrganizeError("provider response must map every input tab exactly once")
    for item in batch.items:
        if not item.collection_name.strip():
            raise OrganizeError("provider response contains a blank collection name")
        if any(not tag.strip() for tag in item.tags):
            raise OrganizeError("provider response contains a blank tag")
        if any(len(tag) > 64 for tag in item.tags):
            raise OrganizeError(
                "provider response contains a tag longer than 64 characters"
            )
    return batch.items


class _HttpProvider:
    """Shared HTTP plumbing for the compatibility providers."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str,
        model: str,
        name: str,
        client: httpx.Client | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.api_key = api_key
        try:
            self.base_url = validate_base_url(base_url)
        except ValueError as error:
            raise OrganizeError(str(error)) from error
        self.model = model
        self.name = name
        self.client = client
        self.timeout = timeout

    def _post(
        self, url: str, *, headers: dict[str, str], body: dict[str, Any]
    ) -> dict[str, Any]:
        owns_client = self.client is None
        client = self.client or httpx.Client(timeout=self.timeout)
        try:
            response = client.post(url, headers=headers, json=body)
            response.raise_for_status()
            payload = response.json()
        except httpx.HTTPStatusError as error:
            detail = error.response.text.strip()[:MAX_ERROR_DETAIL]
            raise OrganizeError(
                f"{self.name} request failed with HTTP "
                f"{error.response.status_code}: {detail}"
            ) from error
        except httpx.HTTPError as error:
            raise OrganizeError(f"{self.name} request failed: {error}") from error
        except json.JSONDecodeError as error:
            raise OrganizeError(
                f"{self.name} returned invalid JSON: {error}"
            ) from error
        finally:
            if owns_client:
                client.close()
        if not isinstance(payload, dict):
            raise OrganizeError(f"{self.name} returned a non-object response")
        return payload


class OpenAICompatibleProvider(_HttpProvider):
    """Talk to any endpoint that implements OpenAI ``/chat/completions``."""

    api_format = ApiFormat.OPENAI

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str,
        model: str,
        name: str = "openai",
        client: httpx.Client | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        super().__init__(
            api_key,
            base_url=base_url,
            model=model,
            name=name,
            client=client,
            timeout=timeout,
        )

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]:
        prompt = build_prompt(tabs, include_full_url=include_full_url)
        body: dict[str, Any] = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = self._post(
            f"{self.base_url}/chat/completions", headers=headers, body=body
        )
        content = _openai_content(payload, provider=self.name)
        return validate_complete_batch(extract_json_payload(content), tabs)


class OpenAIResponsesProvider(_HttpProvider):
    """Talk to OpenAI's current ``/responses`` endpoint.

    OpenAI recommends the Responses API over the older Chat Completions API,
    and the newest models are served through it.
    """

    api_format = ApiFormat.RESPONSES

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str,
        model: str,
        name: str = "openai",
        client: httpx.Client | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        super().__init__(
            api_key,
            base_url=base_url,
            model=model,
            name=name,
            client=client,
            timeout=timeout,
        )

    @property
    def responses_url(self) -> str:
        """Return the responses endpoint for the configured base URL."""
        if self.base_url.endswith("/v1"):
            return f"{self.base_url}/responses"
        return f"{self.base_url}/v1/responses"

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]:
        prompt = build_prompt(tabs, include_full_url=include_full_url)
        body: dict[str, Any] = {"model": self.model, "input": prompt}
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = self._post(self.responses_url, headers=headers, body=body)
        content = _responses_content(payload, provider=self.name)
        return validate_complete_batch(extract_json_payload(content), tabs)


class AnthropicCompatibleProvider(_HttpProvider):
    """Talk to any endpoint that implements Anthropic ``/v1/messages``."""

    api_format = ApiFormat.ANTHROPIC

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str,
        model: str,
        name: str = "anthropic",
        client: httpx.Client | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        super().__init__(
            api_key,
            base_url=base_url,
            model=model,
            name=name,
            client=client,
            timeout=timeout,
        )

    @property
    def messages_url(self) -> str:
        """Return the messages endpoint for the configured base URL."""
        if self.base_url.endswith("/v1"):
            return f"{self.base_url}/messages"
        return f"{self.base_url}/v1/messages"

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]:
        prompt = build_prompt(tabs, include_full_url=include_full_url)
        body: dict[str, Any] = {
            "model": self.model,
            "max_tokens": MAX_TOKENS,
            "temperature": 0,
            "messages": [{"role": "user", "content": prompt}],
        }
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        }
        payload = self._post(self.messages_url, headers=headers, body=body)
        content = _anthropic_content(payload, provider=self.name)
        return validate_complete_batch(extract_json_payload(content), tabs)


def provider_for_profile(
    profile: ProviderProfile,
    api_key: str,
    *,
    client: httpx.Client | None = None,
) -> OpenAICompatibleProvider | OpenAIResponsesProvider | AnthropicCompatibleProvider:
    """Return the adapter that matches ``profile``'s API format."""
    if profile.api_format is ApiFormat.ANTHROPIC:
        return AnthropicCompatibleProvider(
            api_key,
            base_url=profile.base_url,
            model=profile.model,
            name=profile.name,
            client=client,
        )
    if profile.api_format is ApiFormat.RESPONSES:
        return OpenAIResponsesProvider(
            api_key,
            base_url=profile.base_url,
            model=profile.model,
            name=profile.name,
            client=client,
        )
    return OpenAICompatibleProvider(
        api_key,
        base_url=profile.base_url,
        model=profile.model,
        name=profile.name,
        client=client,
    )


def _openai_content(payload: dict[str, Any], *, provider: str) -> str:
    try:
        message = payload["choices"][0]["message"]
    except (KeyError, IndexError, TypeError) as error:
        raise OrganizeError(
            f"{provider} response did not include a completion"
        ) from error
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(content, list):
        content = "".join(
            part.get("text", "")
            for part in content
            if isinstance(part, dict) and isinstance(part.get("text"), str)
        )
    if not isinstance(content, str) or not content.strip():
        raise OrganizeError(f"{provider} response did not include any text")
    return content


def _responses_content(payload: dict[str, Any], *, provider: str) -> str:
    """Return the text of an OpenAI Responses API result."""
    direct = payload.get("output_text")
    if isinstance(direct, str) and direct.strip():
        return direct
    output = payload.get("output")
    if not isinstance(output, list):
        raise OrganizeError(f"{provider} response did not include any text")
    texts: list[str] = []
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for block in content:
            if not isinstance(block, dict):
                continue
            if block.get("type") in {"output_text", "text"}:
                text = block.get("text")
                if isinstance(text, str):
                    texts.append(text)
    joined = "".join(texts)
    if not joined.strip():
        raise OrganizeError(f"{provider} response did not include any text")
    return joined


def _anthropic_content(payload: dict[str, Any], *, provider: str) -> str:
    blocks = payload.get("content")
    if not isinstance(blocks, list) or not blocks:
        raise OrganizeError(f"{provider} response did not include any text")
    text = "".join(
        block.get("text", "")
        for block in blocks
        if isinstance(block, dict) and isinstance(block.get("text"), str)
    )
    if not text.strip():
        raise OrganizeError(f"{provider} response did not include any text")
    return text
