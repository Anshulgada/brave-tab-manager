"""Guarded conversion of legacy Tabman JSON and ``all_tabs.md`` exports."""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from uuid import NAMESPACE_URL, UUID, uuid5

from tabman.models import (
    Collection,
    CollectionStatus,
    ExportDocument,
    Settings,
    Tab,
    Tag,
)

DEFAULT_SETTINGS = Settings(
    theme="system",
    default_view="list",
    include_full_url_in_ai=False,
    ai_provider=None,
)

LEGACY_HEADING = re.compile(r"^##\s+(?P<title>.+?)\s*$")
LEGACY_FIELD = re.compile(
    r"^-\s+\*\*(?P<name>URL|Main Category|Tags):\*\*\s*(?P<value>.*)\s*$"
)


class LegacyImportError(ValueError):
    """Raised when a file is not a recognized, safe legacy export."""


def _read_legacy_json(path: Path) -> list[dict[str, Any]]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise LegacyImportError(f"cannot read legacy JSON: {error}") from error
    if not isinstance(value, list):
        raise LegacyImportError("legacy JSON must contain a top-level array")
    if not all(isinstance(item, dict) for item in value):
        raise LegacyImportError("legacy JSON entries must be objects")
    return value


def _read_legacy_markdown(path: Path) -> list[dict[str, Any]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise LegacyImportError(f"cannot read legacy Markdown: {error}") from error
    records: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for line in lines:
        heading = LEGACY_HEADING.match(line)
        if heading:
            if current:
                records.append(current)
            current = {"title": heading.group("title")}
            continue
        field = LEGACY_FIELD.match(line)
        if field and current is not None:
            name = field.group("name")
            value = field.group("value").strip()
            if name == "URL":
                current["url"] = value
            elif name == "Main Category":
                current["main_category"] = value
            else:
                current["tags"] = [
                    tag.strip() for tag in value.split(",") if tag.strip()
                ]
    if current:
        records.append(current)
    if not records:
        raise LegacyImportError("no legacy tab records found in Markdown")
    return records


def _clean_record(record: dict[str, Any], index: int) -> dict[str, Any]:
    title = record.get("title")
    url = record.get("url")
    category = record.get("main_category", "Imported")
    tags = record.get("tags", [])
    if not isinstance(title, str) or not isinstance(url, str):
        raise LegacyImportError(f"legacy record {index} requires string title and URL")
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise LegacyImportError(f"legacy record {index} has an unsafe or invalid URL")
    if not isinstance(category, str) or not category.strip():
        category = "Imported"
    if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
        raise LegacyImportError(f"legacy record {index} tags must be strings")
    return {
        "title": title.strip() or parsed.hostname,
        "url": url,
        "hostname": parsed.hostname,
        "category": category.strip()[:120],
        "tags": tuple(dict.fromkeys(tag.strip()[:64] for tag in tags if tag.strip())),
    }


def _stable_id(kind: str, value: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"https://tabman.local/legacy/{kind}/{value}")


def import_legacy(path: Path) -> ExportDocument:
    """Convert an explicit legacy path without modifying or deleting its source."""
    resolved = path.expanduser().resolve(strict=True)
    records = (
        _read_legacy_json(resolved)
        if resolved.suffix.casefold() == ".json"
        else _read_legacy_markdown(resolved)
        if resolved.suffix.casefold() in {".md", ".markdown"}
        else None
    )
    if records is None:
        raise LegacyImportError("legacy import accepts only .json, .md, or .markdown")

    captured_at = datetime.fromtimestamp(resolved.stat().st_mtime, tz=UTC)
    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    seen_urls: set[str] = set()
    for index, record in enumerate(records, start=1):
        cleaned = _clean_record(record, index)
        if cleaned["url"] in seen_urls:
            continue
        seen_urls.add(cleaned["url"])
        grouped[cleaned["category"]].append(cleaned)

    collections: list[Collection] = []
    for category, items in grouped.items():
        tag_names = tuple(dict.fromkeys(tag for item in items for tag in item["tags"]))
        tags = tuple(
            Tag(id=_stable_id("tag", f"{category}/{name.casefold()}"), name=name)
            for name in tag_names
        )
        tag_by_name = {tag.name: tag.id for tag in tags}
        tabs = tuple(
            Tab(
                id=_stable_id("tab", item["url"]),
                title=item["title"],
                url=item["url"],
                hostname=item["hostname"],
                pinned=False,
                position=position,
                created_at=captured_at,
                last_accessed_at=None,
                tag_ids=tuple(tag_by_name[name] for name in item["tags"]),
            )
            for position, item in enumerate(items)
        )
        collections.append(
            Collection(
                id=_stable_id("collection", category.casefold()),
                name=category,
                description=f"Imported from {resolved.name}",
                color=None,
                created_at=captured_at,
                updated_at=captured_at,
                status=CollectionStatus.ACTIVE,
                tags=tags,
                tabs=tabs,
            )
        )

    return ExportDocument(
        schema_version=1,
        exported_at=captured_at,
        collections=tuple(collections),
        sessions=(),
        proposals=(),
        settings=DEFAULT_SETTINGS,
    )
