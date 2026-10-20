# Tabman shared schema

This package is the language-neutral contract between the Chromium extension and
the Python CLI.

`tabman.schema.json` is a strict JSON Schema 2020-12 contract. The root export
envelope is versioned with `schemaVersion`; version `1` covers collections, tabs,
tags, captured sessions, organize proposals, and non-secret settings.

The canonical cross-runtime fixture is `fixtures/collection.v1.json`. Both the
Python Pydantic models and extension Zod schemas must parse this file before a
schema change can merge. Additive or breaking changes require a new schema
version and explicit persistence migration.

Legacy fixtures document the old dated JSON array and append-only
`all_tabs.md` formats. They are accepted only by the guarded CLI converter;
Markdown is export-only and is never a source of truth.

## Contract rules

- IDs are UUIDs and timestamps are timezone-aware ISO 8601 values.
- Unknown properties are rejected before persistence.
- A tab may reference only tags declared by its collection.
- Settings exports never include API keys or other secrets.
- Importers validate stable IDs and write in a transaction; each surface must
  make its merge-versus-replace policy explicit. Default imports merge by ID;
  both CLI and extension support an explicit replace mode.
