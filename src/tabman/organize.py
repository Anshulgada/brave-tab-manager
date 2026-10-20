"""Batch organization providers, validation, preview, and explicit apply."""

from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import replace
from datetime import UTC, datetime
from typing import Protocol
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

import httpx

from tabman.config import (
    DETERMINISTIC_PROVIDER,
    LEGACY_PROVIDERS,
    ApiFormat,
    AppConfig,
    ProviderProfile,
    find_profile,
    provider_names,
    resolve_secret,
    validate_base_url,
)
from tabman.errors import OrganizeError
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
from tabman.providers import (
    AnthropicCompatibleProvider,
    OpenAICompatibleProvider,
    OpenAIResponsesProvider,
    Suggestion,
    SuggestionBatch,
    build_prompt,
    provider_for_profile,
    validate_complete_batch,
)

__all__ = [
    "AnthropicCompatibleProvider",
    "DeterministicProvider",
    "GeminiProvider",
    "MistralProvider",
    "OpenAICompatibleProvider",
    "OpenAIResponsesProvider",
    "OrganizeError",
    "Provider",
    "Suggestion",
    "SuggestionBatch",
    "apply_proposal",
    "build_provider",
    "create_proposal",
    "proposal_rows",
]

# Backwards compatible aliases for the private helpers used by older tests.
_prompt = build_prompt
_validate_complete_batch = validate_complete_batch


class Provider(Protocol):
    name: str

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]: ...


class DeterministicProvider:
    """Group tabs by hostname without contacting any service."""

    name = DETERMINISTIC_PROVIDER

    def suggest(
        self, tabs: tuple[Tab, ...], *, include_full_url: bool
    ) -> tuple[Suggestion, ...]:
        del include_full_url
        return tuple(
            Suggestion(
                tabId=tab.id,
                collectionName=_fallback_collection_name(tab),
                tags=tuple(
                    dict.fromkeys(part[:64] for part in tab.hostname.split(".") if part)
                )[-2:],
            )
            for tab in tabs
        )


def _fallback_collection_name(tab: Tab) -> str:
    hostname = tab.hostname.strip().strip(".")
    if hostname:
        return hostname[:120]
    scheme = urlsplit(tab.url).scheme.casefold()
    if scheme:
        return scheme[:120]
    return "Tabs"


class MistralProvider(OpenAICompatibleProvider):
    """Legacy Mistral helper; Mistral speaks the OpenAI compatibility format."""

    def __init__(
        self,
        api_key: str,
        *,
        base_url: str,
        model: str = "mistral-small-latest",
        client: httpx.Client | None = None,
    ) -> None:
        super().__init__(
            api_key,
            base_url=base_url,
            model=model,
            name="mistral",
            client=client,
        )


class GeminiProvider:
    """Legacy Gemini helper kept for accounts that still have a key."""

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
            return validate_complete_batch(json.loads(content), tabs)
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


def _provider_from_profile(
    profile: ProviderProfile, secret: str
) -> OpenAICompatibleProvider | OpenAIResponsesProvider | AnthropicCompatibleProvider:
    return provider_for_profile(profile, secret)


def build_provider(
    name: str,
    config: AppConfig,
    *,
    prompt_for_secret: bool,
    base_url: str | None = None,
    model: str | None = None,
    api_format: ApiFormat | None = None,
) -> Provider:
    """Return the provider adapter for ``name``.

    ``deterministic`` never leaves the machine. Every other name must match a
    built-in preset (OpenAI, Anthropic) or a profile added with
    ``tabman config add-provider``. The base URL, model, and API format may be
    overridden for a single run.
    """
    normalized = name.casefold()
    if normalized == DETERMINISTIC_PROVIDER:
        return DeterministicProvider()
    profile = find_profile(config, normalized)
    if profile is None and base_url and model:
        profile = ProviderProfile(
            name=name.strip(),
            base_url=validate_base_url(base_url),
            model=model.strip(),
            api_format=api_format or ApiFormat.OPENAI,
        )
    if profile is None:
        if normalized in LEGACY_PROVIDERS:
            secret = resolve_secret(normalized, prompt=prompt_for_secret)
            if not secret:
                raise OrganizeError(
                    f"{normalized} key is unavailable; use environment, "
                    "config-dir, or prompt"
                )
            if normalized == "mistral":
                return MistralProvider(secret, base_url=config.mistral_base_url)
            return GeminiProvider(secret)
        available = ", ".join(provider_names(config))
        raise OrganizeError(
            f"unknown provider: {name}. Available providers: {available}"
        )
    if base_url:
        profile = replace(profile, base_url=validate_base_url(base_url))
    if model:
        profile = replace(profile, model=model.strip())
    if api_format:
        profile = replace(profile, api_format=api_format)
    secret = resolve_secret(
        profile.name, prompt=prompt_for_secret, env_var=profile.env_name
    )
    if not secret:
        raise OrganizeError(
            f"{profile.name} key is unavailable; set {profile.env_name} or run "
            f"`tabman config set-key {profile.name}`"
        )
    return _provider_from_profile(profile, secret)


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
    suggestions = validate_complete_batch(
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
    if set(suggestions) != set(all_tabs):
        raise OrganizeError("proposal must map every vault tab exactly once")

    name_keys = [
        item.name.casefold()
        for item in document.collections
        if item.status == CollectionStatus.ACTIVE
    ]
    if len(name_keys) != len(set(name_keys)):
        raise OrganizeError(
            "cannot apply when collections differ only by letter case; "
            "rename them first"
        )

    existing_by_name = {
        item.name.casefold(): item
        for item in document.collections
        if item.status == CollectionStatus.ACTIVE
    }
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
                status=CollectionStatus.ACTIVE,
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
    retained_proposals = []
    for item in document.proposals:
        if item.id == proposal.id:
            continue
        if item.status == ProposalStatus.PREVIEW:
            retained_proposals.append(
                item.model_copy(update={"status": ProposalStatus.REJECTED})
            )
        else:
            retained_proposals.append(item)
    retained_proposals.append(applied)
    payload = document.model_dump(by_alias=True, mode="json")
    payload.update(
        {
            "exportedAt": now.isoformat().replace("+00:00", "Z"),
            "collections": [
                item.model_dump(by_alias=True, mode="json") for item in collections
            ],
            "proposals": [
                item.model_dump(by_alias=True, mode="json")
                for item in retained_proposals
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
