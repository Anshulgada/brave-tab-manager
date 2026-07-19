"""Transactional SQLite vault and shared-format import/export."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from tabman.models import (
    Collection,
    ExportDocument,
    Proposal,
    Session,
    Settings,
    Tab,
)

SCHEMA_VERSION = 1
DEFAULT_SETTINGS = Settings(
    theme="system",
    default_view="list",
    include_full_url_in_ai=False,
    ai_provider=None,
)


class Vault:
    """Own a local SQLite vault without exposing implementation details to commands."""

    def __init__(self, path: Path) -> None:
        self.path = path.expanduser().resolve()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            self._migrate(connection)
            yield connection
        finally:
            connection.close()

    @staticmethod
    def _migrate(connection: sqlite3.Connection) -> None:
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        if version > SCHEMA_VERSION:
            raise RuntimeError(
                f"vault schema {version} is newer than supported {SCHEMA_VERSION}"
            )
        if version == 0:
            with connection:
                connection.execute(
                    """
                    CREATE TABLE collections (
                        id TEXT PRIMARY KEY,
                        updated_at TEXT NOT NULL,
                        payload TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    CREATE TABLE sessions (
                        id TEXT PRIMARY KEY,
                        captured_at TEXT NOT NULL,
                        payload TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    CREATE TABLE proposals (
                        id TEXT PRIMARY KEY,
                        created_at TEXT NOT NULL,
                        payload TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    CREATE TABLE settings (
                        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                        payload TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    CREATE TABLE metadata (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    "CREATE INDEX collections_updated_at ON collections(updated_at)"
                )
                connection.execute(
                    "CREATE INDEX sessions_captured_at ON sessions(captured_at)"
                )
                connection.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")

    @staticmethod
    def _json(model: Collection | Session | Proposal | Settings) -> str:
        return model.model_dump_json(by_alias=True, exclude_none=False)

    def _owned_identities(
        self, connection: sqlite3.Connection
    ) -> tuple[dict[str, str], dict[str, str]]:
        """Map existing tab/tag IDs to the collection that currently owns them."""
        tab_owners: dict[str, str] = {}
        tag_owners: dict[str, str] = {}
        for row in connection.execute("SELECT id, payload FROM collections"):
            collection = Collection.model_validate_json(row["payload"])
            collection_id = str(collection.id)
            for tab in collection.tabs:
                tab_owners[str(tab.id)] = collection_id
            for tag in collection.tags:
                tag_owners[str(tag.id)] = collection_id
        return tab_owners, tag_owners

    def _assert_merge_identities(
        self, connection: sqlite3.Connection, document: ExportDocument
    ) -> None:
        """Reject merges that would duplicate tab/tag IDs across collections."""
        tab_owners, tag_owners = self._owned_identities(connection)
        incoming_collections = {str(item.id) for item in document.collections}
        for collection_id in incoming_collections:
            for tab_id, owner in list(tab_owners.items()):
                if owner == collection_id:
                    del tab_owners[tab_id]
            for tag_id, owner in list(tag_owners.items()):
                if owner == collection_id:
                    del tag_owners[tag_id]

        for collection in document.collections:
            collection_id = str(collection.id)
            for tab in collection.tabs:
                tab_id = str(tab.id)
                owner = tab_owners.get(tab_id)
                if owner is not None and owner != collection_id:
                    raise ValueError(
                        f"tab {tab_id} already belongs to another collection"
                    )
                tab_owners[tab_id] = collection_id
            for tag in collection.tags:
                tag_id = str(tag.id)
                owner = tag_owners.get(tag_id)
                if owner is not None and owner != collection_id:
                    raise ValueError(
                        f"tag {tag_id} already belongs to another collection"
                    )
                tag_owners[tag_id] = collection_id

    def import_document(
        self,
        document: ExportDocument,
        *,
        replace: bool = False,
        write_settings: bool = True,
    ) -> None:
        """Merge or replace the vault with one validated document atomically."""
        document = ExportDocument.model_validate(
            document.model_dump(by_alias=True, mode="json")
        )
        with self.connect() as connection, connection:
            if replace:
                connection.execute("DELETE FROM collections")
                connection.execute("DELETE FROM sessions")
                connection.execute("DELETE FROM proposals")
                if write_settings:
                    connection.execute("DELETE FROM settings")
                connection.execute("DELETE FROM metadata")
            else:
                self._assert_merge_identities(connection, document)
            connection.executemany(
                """
                INSERT INTO collections(id, updated_at, payload)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    updated_at = excluded.updated_at,
                    payload = excluded.payload
                """,
                (
                    (str(item.id), item.updated_at.isoformat(), self._json(item))
                    for item in document.collections
                ),
            )
            connection.executemany(
                """
                INSERT INTO sessions(id, captured_at, payload)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    captured_at = excluded.captured_at,
                    payload = excluded.payload
                """,
                (
                    (str(item.id), item.captured_at.isoformat(), self._json(item))
                    for item in document.sessions
                ),
            )
            connection.executemany(
                """
                INSERT INTO proposals(id, created_at, payload)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    created_at = excluded.created_at,
                    payload = excluded.payload
                """,
                (
                    (str(item.id), item.created_at.isoformat(), self._json(item))
                    for item in document.proposals
                ),
            )
            if write_settings:
                connection.execute(
                    """
                    INSERT INTO settings(singleton, payload) VALUES (1, ?)
                    ON CONFLICT(singleton) DO UPDATE SET payload = excluded.payload
                    """,
                    (self._json(document.settings),),
                )
            connection.execute(
                """
                INSERT INTO metadata(key, value) VALUES ('last_imported_at', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (document.exported_at.isoformat(),),
            )

    def append_collection(self, collection: Collection) -> None:
        """Atomically persist one newly captured collection."""
        Collection.model_validate(collection.model_dump(by_alias=True, mode="json"))
        document = ExportDocument(
            schema_version=1,
            exported_at=collection.updated_at,
            collections=(collection,),
            sessions=(),
            proposals=(),
            settings=DEFAULT_SETTINGS,
        )
        with self.connect() as connection, connection:
            self._assert_merge_identities(connection, document)
            connection.execute(
                """
                INSERT INTO collections(id, updated_at, payload)
                VALUES (?, ?, ?)
                """,
                (
                    str(collection.id),
                    collection.updated_at.isoformat(),
                    self._json(collection),
                ),
            )

    def export_document(self) -> ExportDocument:
        with self.connect() as connection:
            collections = tuple(
                Collection.model_validate_json(row["payload"])
                for row in connection.execute(
                    "SELECT payload FROM collections ORDER BY updated_at, id"
                )
            )
            sessions = tuple(
                Session.model_validate_json(row["payload"])
                for row in connection.execute(
                    "SELECT payload FROM sessions ORDER BY captured_at, id"
                )
            )
            proposals = tuple(
                Proposal.model_validate_json(row["payload"])
                for row in connection.execute(
                    "SELECT payload FROM proposals ORDER BY created_at, id"
                )
            )
            settings_row = connection.execute(
                "SELECT payload FROM settings WHERE singleton = 1"
            ).fetchone()
            settings = (
                Settings.model_validate_json(settings_row["payload"])
                if settings_row
                else DEFAULT_SETTINGS
            )
        return ExportDocument(
            schema_version=1,
            exported_at=datetime.now(UTC),
            collections=collections,
            sessions=sessions,
            proposals=proposals,
            settings=settings,
        )

    def search_tabs(
        self, query: str = "", *, hostname: str | None = None
    ) -> list[tuple[Collection, Tab]]:
        """Search collection tabs locally with label-safe hostname suffix matching."""
        needle = query.casefold()
        domain = hostname.casefold().strip(".") if hostname else None
        if not domain:
            domain = None
        matches: list[tuple[Collection, Tab]] = []
        for collection in self.export_document().collections:
            for tab in collection.tabs:
                text_match = not needle or needle in (
                    f"{tab.title} {tab.url} {tab.hostname}".casefold()
                )
                tab_host = tab.hostname.casefold().strip(".")
                host_match = domain is None or (
                    tab_host == domain or tab_host.endswith(f".{domain}")
                )
                if text_match and host_match:
                    matches.append((collection, tab))
        return matches

    def write_markdown(self, destination: Path) -> None:
        """Render a human-readable snapshot; Markdown is never read as the vault."""
        document = self.export_document()
        lines = ["# Tabman collections", ""]
        for collection in document.collections:
            lines.extend((f"## {collection.name}", ""))
            if collection.description:
                lines.extend((collection.description, ""))
            for tab in collection.tabs:
                lines.append(f"- [{tab.title}]({tab.url})")
            lines.append("")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text("\n".join(lines), encoding="utf-8")

    def counts(self) -> dict[str, int]:
        with self.connect() as connection:
            return {
                "collections": connection.execute(
                    "SELECT COUNT(*) FROM collections"
                ).fetchone()[0],
                "sessions": connection.execute(
                    "SELECT COUNT(*) FROM sessions"
                ).fetchone()[0],
                "proposals": connection.execute(
                    "SELECT COUNT(*) FROM proposals"
                ).fetchone()[0],
            }


def read_document(path: Path) -> ExportDocument:
    """Read and validate one shared export document."""
    return ExportDocument.model_validate_json(path.read_text(encoding="utf-8"))


def write_document(path: Path, document: ExportDocument) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(document.to_json() + "\n", encoding="utf-8")


def document_as_dict(document: ExportDocument) -> dict[str, Any]:
    """Provide a JSON-compatible mapping for callers that need structured output."""
    return json.loads(document.to_json(indent=None))
