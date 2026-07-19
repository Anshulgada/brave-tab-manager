"""Batch organization providers, validation, preview, and explicit apply."""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import httpx
from pydantic import BaseModel, ConfigDict, Field

from tabman.config import AppConfig, resolve_secret
from tabman.models import (
    Collection,
    CollectionStatus,
    ExportDocument,
    Proposal,
    ProposalItem,
    ProposalStatus,
    Tab,
    Tag,
)


class OrganizeError(RuntimeError):
    """Raised when a provider cannot return a complete, valid batch."""


class Suggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tab_id: UUID = Field(alias="tabId")
    collection_name: str = Field(alias="collectionName", min_length=1, max_length=120)
    tags: tuple[str, ...] = Field(default=(), max_length=12)


class SuggestionBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: tuple[Suggestion, ...]


class Provider(Protocol):
    name: str

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]: ...


def _prompt(tabs: tuple[Tab, ...], *, include_full_url: bool) -> str:
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


def _validate_complete_batch(
    payload: object, tabs: tuple[Tab, ...]
) -> tuple[Suggestion, ...]:
    batch = SuggestionBatch.model_validate(payload)
    expected = {tab.id for tab in tabs}
    actual = {item.tab_id for item in batch.items}
    if len(actual) != len(batch.items) or actual != expected:
        raise OrganizeError("provider response must map every input tab exactly once")
    return batch.items


class DeterministicProvider:
    name = "deterministic"

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]:
        del include_full_url
        return tuple(
            Suggestion(
                tabId=tab.id,
                collectionName=_fallback_collection_name(tab),
                tags=tuple(
                    dict.fromkeys(part for part in tab.hostname.split(".") if part)
                )[-2:],
            )
            for tab in tabs
        )


def _fallback_collection_name(tab: Tab) -> str:
    if tab.hostname.strip():
        return tab.hostname
    scheme = urlsplit(tab.url).scheme.casefold()
    if scheme:
        return scheme
    return "Tabs"


class MistralProvider:
    name = "mistral"

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str,
        model: str = "mistral-small-latest",
        client: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key
        parsed = urlsplit(base_url)
        is_local = parsed.hostname in {"127.0.0.1", "localhost", "::1"}
        if not parsed.hostname or (
            parsed.scheme != "https" and not (parsed.scheme == "http" and is_local)
        ):
            raise OrganizeError("provider base URL must use HTTPS or local HTTP")
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.client = client

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]:
        owns_client = self.client is None
        client = self.client or httpx.Client(timeout=30.0)
        try:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [
                        {
                            "role": "user",
                            "content": _prompt(tabs, include_full_url=include_full_url),
                        }
                    ],
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return _validate_complete_batch(json.loads(content), tabs)
        except (
            httpx.HTTPError,
            KeyError,
            IndexError,
            TypeError,
            json.JSONDecodeError,
        ) as error:
            raise OrganizeError(
                f"Mistral returned an invalid batch: {error}"
            ) from error
        finally:
            if owns_client:
                client.close()


class GeminiProvider:
    name = "gemini"

    def __init__(
        self,
        api_key: str,
        *,
        model: str = "gemini-2.5-flash",
        client: httpx.Client | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model
        self.client = client

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]:
        owns_client = self.client is None
        client = self.client or httpx.Client(timeout=30.0)
        try:
            response = client.post(
                "https://generativelanguage.googleapis.com/v1beta/"
                f"models/{self.model}:generateContent",
                headers={"x-goog-api-key": self.api_key},
                json={
                    "contents": [
                        {
                            "parts": [
                                {
                                    "text": _prompt(
                                        tabs, include_full_url=include_full_url
                                    )
                                }
                            ]
                        }
                    ],
                    "generationConfig": {"responseMimeType": "application/json"},
                },
            )
            response.raise_for_status()
            content = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            return _validate_complete_batch(json.loads(content), tabs)
        except (
            httpx.HTTPError,
            KeyError,
            IndexError,
            TypeError,
            json.JSONDecodeError,
        ) as error:
            raise OrganizeError(f"Gemini returned an invalid batch: {error}") from error
        finally:
            if owns_client:
                client.close()


def build_provider(
    name: str, config: AppConfig, *, prompt_for_secret: bool
) -> Provider:
    normalized = name.casefold()
    if normalized == "deterministic":
        return DeterministicProvider()
    secret = resolve_secret(normalized, prompt=prompt_for_secret)
    if not secret:
        raise OrganizeError(
            f"{normalized} key is unavailable; use environment, config-dir, or prompt"
        )
    if normalized == "mistral":
        return MistralProvider(secret, base_url=config.mistral_base_url)
    if normalized == "gemini":
        return GeminiProvider(secret)
    raise OrganizeError(f"unsupported provider: {name}")


def create_proposal(
    document: ExportDocument,
    provider: Provider,
    *,
    include_full_url: bool,
) -> Proposal:
    tabs = tuple(tab for collection in document.collections for tab in collection.tabs)
    if not tabs:
        raise OrganizeError("the vault has no tabs to organize")
    suggestions = provider.suggest(tabs, include_full_url=include_full_url)
    suggestions = _validate_complete_batch(
        {"items": [item.model_dump(by_alias=True) for item in suggestions]}, tabs
    )
    return Proposal(
        id=uuid4(),
        created_at=datetime.now(UTC),
        provider=provider.name,
        status=ProposalStatus.PREVIEW,
        items=tuple(
            ProposalItem(
                tab_id=item.tab_id,
                collection_name=item.collection_name,
                tags=item.tags,
            )
            for item in suggestions
        ),
    )


def _stable_id(kind: str, value: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"https://tabman.local/organize/{kind}/{value}")


def apply_proposal(document: ExportDocument, proposal: Proposal) -> ExportDocument:
    """Return a replacement document; callers must persist it explicitly."""
    all_tabs = {
        tab.id: tab for collection in document.collections for tab in collection.tabs
    }
    suggestions = {item.tab_id: item for item in proposal.items}
    if not set(suggestions).issubset(all_tabs):
        raise OrganizeError("proposal references tabs that are not in the vault")

    existing_by_name = {item.name.casefold(): item for item in document.collections}
    target_tabs: defaultdict[str, list[Tab]] = defaultdict(list)
    target_names: dict[str, str] = {}
    target_tags: defaultdict[str, dict[str, str]] = defaultdict(dict)
    tab_tag_keys: dict[UUID, tuple[str, ...]] = {}
    for collection in document.collections:
        existing_names = {tag.id: tag.name for tag in collection.tags}
        for tab in collection.tabs:
            suggestion = suggestions.get(tab.id)
            proposed_name = (
                suggestion.collection_name if suggestion else collection.name
            )
            target = proposed_name.casefold()
            existing_target = existing_by_name.get(target)
            target_names.setdefault(
                target, existing_target.name if existing_target else proposed_name
            )
            tag_names = (
                suggestion.tags
                if suggestion
                else tuple(existing_names[tag_id] for tag_id in tab.tag_ids)
            )
            for tag_name in tag_names:
                target_tags[target].setdefault(tag_name.casefold(), tag_name)
            target_tabs[target].append(tab)
            tab_tag_keys[tab.id] = tuple(
                dict.fromkeys(tag_name.casefold() for tag_name in tag_names)
            )

    now = datetime.now(UTC)
    collections: list[Collection] = []
    for target, tabs in target_tabs.items():
        name = target_names[target]
        existing = existing_by_name.get(target)
        tags = tuple(
            Tag(
                id=_stable_id("tag", f"{target}/{tag_key}"),
                name=target_tags[target][tag_key],
            )
            for tag_key in sorted(target_tags[target])
        )
        ids_by_key = {tag.name.casefold(): tag.id for tag in tags}
        rebuilt_tabs = tuple(
            tab.model_copy(
                update={
                    "position": position,
                    "tag_ids": tuple(
                        ids_by_key[tag_key] for tag_key in tab_tag_keys[tab.id]
                    ),
                }
            )
            for position, tab in enumerate(tabs)
        )
        collections.append(
            Collection(
                id=(existing.id if existing else _stable_id("collection", target)),
                name=name,
                description=existing.description if existing else None,
                color=existing.color if existing else None,
                created_at=existing.created_at if existing else now,
                updated_at=now,
                status=existing.status if existing else CollectionStatus.ACTIVE,
                tags=tags,
                tabs=rebuilt_tabs,
            )
        )

    emitted_ids = {item.id for item in collections}
    for collection in document.collections:
        if collection.id in emitted_ids:
            continue
        collections.append(
            collection
            if not collection.tabs and not collection.tags
            else collection.model_copy(
                update={"tabs": (), "tags": (), "updated_at": now}
            )
        )
        emitted_ids.add(collection.id)

    applied = proposal.model_copy(update={"status": ProposalStatus.APPLIED})
    payload = document.model_dump(by_alias=True, mode="json")
    payload.update(
        {
            "exportedAt": now.isoformat().replace("+00:00", "Z"),
            "collections": [
                item.model_dump(by_alias=True, mode="json") for item in collections
            ],
            "proposals": [
                item.model_dump(by_alias=True, mode="json")
                for item in (
                    *(item for item in document.proposals if item.id != proposal.id),
                    applied,
                )
            ],
        }
    )
    return ExportDocument.model_validate(payload)


def proposal_rows(proposal: Proposal) -> Iterable[dict[str, object]]:
    for item in proposal.items:
        yield {
            "tabId": str(item.tab_id),
            "collectionName": item.collection_name,
            "tags": list(item.tags),
        }
