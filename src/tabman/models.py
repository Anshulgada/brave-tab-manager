"""Strict Python mirror of the shared Tabman interchange contract."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal
from urllib.parse import urlsplit
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

ShortName = Annotated[str, StringConstraints(min_length=1, max_length=64)]
CollectionName = Annotated[str, StringConstraints(min_length=1, max_length=120)]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9A-Fa-f]{6}$")]
WebAddress = Annotated[str, StringConstraints(min_length=1, max_length=8192)]
ALLOWED_TAB_SCHEMES = frozenset(
    {
        "http",
        "https",
        "chrome",
        "chrome-extension",
        "brave",
        "edge",
        "about",
    }
)


class ContractModel(BaseModel):
    """Base model that rejects contract drift and supports camel-case aliases."""

    model_config = ConfigDict(
        alias_generator=lambda value: (
            value.split("_")[0] + "".join(part.title() for part in value.split("_")[1:])
        ),
        extra="forbid",
        frozen=True,
        populate_by_name=True,
    )


class CollectionStatus(StrEnum):
    ACTIVE = "active"
    TRASHED = "trashed"


class ProposalStatus(StrEnum):
    PREVIEW = "preview"
    APPLIED = "applied"
    REJECTED = "rejected"


class Tag(ContractModel):
    id: UUID
    name: ShortName
    color: Color | None = None


class Tab(ContractModel):
    id: UUID
    title: Annotated[str, StringConstraints(max_length=2048)]
    url: WebAddress
    hostname: Annotated[str, StringConstraints(max_length=253)]
    fav_icon_url: WebAddress | None = None
    pinned: bool
    position: Annotated[int, Field(ge=0)]
    created_at: AwareDatetime
    last_accessed_at: AwareDatetime | None
    tag_ids: tuple[UUID, ...] = ()

    @field_validator("url", "fav_icon_url")
    @classmethod
    def validate_address(cls, value: str | None) -> str | None:
        """Allow only restore-safe absolute URLs."""
        if value is None:
            return None
        parsed = urlsplit(value)
        scheme = parsed.scheme.casefold()
        if scheme not in ALLOWED_TAB_SCHEMES:
            raise ValueError("URL scheme is not allowed")
        if scheme in {"http", "https"} and not parsed.hostname:
            raise ValueError("HTTP URL must include a hostname")
        return value

    @field_validator("tag_ids")
    @classmethod
    def unique_tag_ids(cls, value: tuple[UUID, ...]) -> tuple[UUID, ...]:
        if len(value) != len(set(value)):
            raise ValueError("tagIds must be unique")
        return value

    @model_validator(mode="after")
    def validate_hostname(self) -> Tab:
        parsed = urlsplit(self.url)
        if parsed.scheme in {"http", "https"}:
            expected = (parsed.hostname or "").casefold()
            if self.hostname.casefold() != expected:
                raise ValueError("hostname must match the URL host")
        return self


class Collection(ContractModel):
    id: UUID
    name: CollectionName
    description: Annotated[str, StringConstraints(max_length=4096)] | None
    color: Color | None
    created_at: AwareDatetime
    updated_at: AwareDatetime
    status: CollectionStatus
    tags: tuple[Tag, ...]
    tabs: tuple[Tab, ...]

    @model_validator(mode="after")
    def validate_references(self) -> Collection:
        tag_ids = {tag.id for tag in self.tags}
        if len(tag_ids) != len(self.tags):
            raise ValueError("collection tag IDs must be unique")
        tab_ids = {tab.id for tab in self.tabs}
        if len(tab_ids) != len(self.tabs):
            raise ValueError("collection tab IDs must be unique")
        missing = {tag_id for tab in self.tabs for tag_id in tab.tag_ids} - tag_ids
        if missing:
            raise ValueError("tab references a tag outside its collection")
        return self


class Session(ContractModel):
    id: UUID
    name: CollectionName
    captured_at: AwareDatetime
    browser: ShortName
    window_count: Annotated[int, Field(ge=0)]
    tabs: tuple[Tab, ...]

    @model_validator(mode="after")
    def validate_session_tabs(self) -> Session:
        tab_ids = [tab.id for tab in self.tabs]
        if len(tab_ids) != len(set(tab_ids)):
            raise ValueError("session tab IDs must be unique")
        if any(tab.tag_ids for tab in self.tabs):
            raise ValueError("session tabs cannot reference collection tags")
        return self


class ProposalItem(ContractModel):
    tab_id: UUID
    collection_name: CollectionName
    tags: Annotated[tuple[ShortName, ...], Field(max_length=12)] = ()


class Proposal(ContractModel):
    id: UUID
    created_at: AwareDatetime
    provider: ShortName
    status: ProposalStatus
    items: tuple[ProposalItem, ...]

    @model_validator(mode="after")
    def validate_tab_mapping(self) -> Proposal:
        tab_ids = [item.tab_id for item in self.items]
        if len(tab_ids) != len(set(tab_ids)):
            raise ValueError("a proposal may map each tab only once")
        return self


class Settings(ContractModel):
    theme: Literal["system", "light", "dark"]
    default_view: Literal["list", "grid"]
    include_full_url_in_ai: bool
    ai_provider: ShortName | None


class ExportDocument(ContractModel):
    schema_version: Literal[1]
    exported_at: AwareDatetime
    collections: tuple[Collection, ...]
    sessions: tuple[Session, ...]
    proposals: tuple[Proposal, ...]
    settings: Settings

    @model_validator(mode="after")
    def validate_document_ids(self) -> ExportDocument:
        for records, label in (
            (self.collections, "collection"),
            (self.sessions, "session"),
            (self.proposals, "proposal"),
        ):
            ids = [record.id for record in records]
            if len(ids) != len(set(ids)):
                raise ValueError(f"{label} IDs must be unique")
        tab_ids = [
            tab.id for collection in self.collections for tab in collection.tabs
        ] + [tab.id for session in self.sessions for tab in session.tabs]
        if len(tab_ids) != len(set(tab_ids)):
            raise ValueError("tab IDs must be unique across the document")
        tag_ids = [tag.id for collection in self.collections for tag in collection.tags]
        if len(tag_ids) != len(set(tag_ids)):
            raise ValueError("tag IDs must be unique across the document")
        return self

    def to_json(self, *, indent: int | None = 2) -> str:
        """Serialize using the language-neutral field names."""
        return self.model_dump_json(by_alias=True, exclude_none=False, indent=indent)
