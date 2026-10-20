# Architecture

Tabman has two surfaces that share one contract: a browser extension for the daily work and a Python CLI for the vault. They never talk to each other directly. They exchange files.

```
┌──────────────────────┐        ┌──────────────────────┐
│  Extension (WXT +    │        │  CLI (Python 3.14)   │
│  React, IndexedDB)   │        │  SQLite vault        │
└──────────┬───────────┘        └──────────┬───────────┘
           │                               │
           └──────── packages/schema ──────┘
                  shared JSON documents
```

## The shared contract

`packages/schema/` holds the documents both sides read and write: collections, tags, tabs, sessions, proposals, and settings. The Python side mirrors it in Pydantic (`src/tabman/models.py`), the extension side in Zod (`extension/src/schema.ts`). Both validate on the way in and on the way out, so a malformed file is rejected with a clear error instead of corrupting a store.

`tests/test_schema_json.py` and `extension/tests/schema.test.ts` check that the schema and its mirrors still agree.

## The extension

| Part                        | Responsibility                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `entrypoints/background.ts` | The service worker. It owns the browser APIs, the messaging, and the notification broadcasts.                     |
| `src/background-service.ts` | The switchboard commands: search, activate, close, discard, move, group, park, restore.                           |
| `src/organize-service.ts`   | The organizer: collect the open tabs, ask the provider, validate the answer, write the proposal into the library. |
| `src/ai.ts`                 | The provider adapters and the batch contract. The model answer is validated with Zod before it reaches the page.  |
| `src/provider-store.ts`     | Where the provider profiles and the API key live. Keys default to session storage.                                |
| `src/library.ts`            | The library API the pages use: collections, tags, moves, restores, import, export.                                |
| `src/database.ts`           | The Dexie schema and the migrations.                                                                              |
| `entrypoints/dashboard/`    | The library application: collections, tags, cards, the command palette, the providers, the organizer.             |
| `entrypoints/sidepanel/`    | The switchboard: every window, the search, the bulk actions, and the saved collections.                           |

The pages talk to the worker with a single typed message union (`src/messages.ts`). Every request is parsed with Zod, and every answer carries an `ok` flag so a failure becomes a message instead of an exception.

The provider call lives in the worker on purpose. The page never sees the key, and the answer is validated in the same place that made the request.

## The CLI

| Part                      | Responsibility                                                    |
| ------------------------- | ----------------------------------------------------------------- |
| `src/tabman/cli.py`       | The rich-click command tree.                                      |
| `src/tabman/vault.py`     | The SQLite vault: schema, migrations, merges, search, export.     |
| `src/tabman/providers.py` | The OpenAI, Responses, and Anthropic adapters.                    |
| `src/tabman/organize.py`  | The proposal, the preview, and the apply.                         |
| `src/tabman/config.py`    | The configuration, the provider profiles, and the secret storage. |
| `src/tabman/theme.py`     | The shared look for every command line surface.                   |

The CLI never starts a server and never phones home. The vault is a single SQLite file.

## The data flow that matters

1. The side panel parks a selection. The worker writes a collection with the tabs into IndexedDB and closes the browser tabs.
2. The dashboard shows the library. The two surfaces share the schema, not the storage, so the CLI and the extension can hold different libraries.
3. An export from either side is a JSON document that the other side imports, merging by stable IDs.
4. The organizer collects the open tabs, sends one batched request, and writes a proposal that a human confirms before it is applied.

## Rules the code keeps

- Local first. No accounts, no telemetry, no page content.
- Least privilege. Host permissions for a provider are optional and requested one at a time.
- Keys never travel in an export, a log, or an argument list.
- A destructive action asks first, in the interface, not in a browser dialog.
