import 'fake-indexeddb/auto';

import { readFileSync } from 'node:fs';

import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DATABASE_VERSION,
  TabmanDatabase,
  type TabRecord,
  VERSION_ONE_STORES,
} from '../src/database';
import { exportDatabase, importExportDocument } from '../src/import-export';
import { type ExportDocument, parseExportDocument } from '../src/schema';

const fixtureUrl = new URL(
  '../../packages/schema/fixtures/collection.v1.json',
  import.meta.url,
);

let databaseCounter = 0;
const openDatabases: TabmanDatabase[] = [];
const databaseNames = new Set<string>();

function nextDatabaseName(): string {
  databaseCounter += 1;
  const name = `tabman-database-test-${databaseCounter}`;
  databaseNames.add(name);
  return name;
}

function createDatabase(name = nextDatabaseName()): TabmanDatabase {
  const database = new TabmanDatabase(name);
  openDatabases.push(database);
  return database;
}

function loadFixture(): ExportDocument {
  return parseExportDocument(JSON.parse(readFileSync(fixtureUrl, 'utf8')));
}

function expectSemanticExport(
  actual: ExportDocument,
  expected: ExportDocument,
): void {
  expect(actual.schemaVersion).toBe(expected.schemaVersion);
  expect(actual.collections).toEqual(expected.collections);
  expect(actual.sessions).toEqual(expected.sessions);
  expect(actual.proposals).toEqual(expected.proposals);
  expect(actual.settings).toEqual(expected.settings);
  expect(Date.parse(actual.exportedAt)).not.toBeNaN();
}

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
  await Promise.all([...databaseNames].map((name) => Dexie.delete(name)));
  databaseNames.clear();
});

describe('Tabman database import and export', () => {
  it('round-trips the shared fixture and preserves relationships', async () => {
    const database = createDatabase();
    const fixture = loadFixture();

    await importExportDocument(database, fixture);
    const exported = await exportDatabase(database);

    expectSemanticExport(exported, fixture);
    expect(exported.collections[0]?.tabs[0]?.tagIds).toEqual([
      exported.collections[0]?.tags[0]?.id,
    ]);
    expect(
      await database.tabs.get(fixture.collections[0]?.tabs[0]?.id ?? ''),
    ).toMatchObject({
      collectionId: fixture.collections[0]?.id,
      normalizedHostname: 'developer.chrome.com',
    });
  });

  it('is idempotent when the same export is imported repeatedly', async () => {
    const database = createDatabase();
    const fixture = loadFixture();

    await importExportDocument(database, fixture);
    await importExportDocument(database, fixture);

    expectSemanticExport(await exportDatabase(database), fixture);
    await expect(
      Promise.all([
        database.collections.count(),
        database.tabs.count(),
        database.tags.count(),
        database.sessions.count(),
        database.proposals.count(),
        database.settings.count(),
      ]),
    ).resolves.toEqual([1, 2, 1, 1, 1, 1]);
  });

  it('merges by stable ids without wiping unrelated local collections', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);

    const firstCollection = fixture.collections[0];
    expect(firstCollection).toBeDefined();
    if (!firstCollection) {
      throw new Error('Fixture must contain a collection');
    }

    const partial = structuredClone(fixture);
    partial.collections = [
      {
        ...firstCollection,
        id: '10000000-0000-4000-8000-000000000099',
        name: 'Extra',
        tabs: [],
        tags: [],
      },
    ];
    partial.sessions = [];
    partial.proposals = [];

    await importExportDocument(database, partial);
    const exported = await exportDatabase(database);

    expect(exported.collections.map((item) => item.name).sort()).toEqual([
      'Extra',
      'Research',
    ]);
  });

  it('preserves local-only tabs when merging an overlapping collection', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);

    const firstCollection = fixture.collections[0];
    expect(firstCollection).toBeDefined();
    if (!firstCollection) {
      throw new Error('Fixture must contain a collection');
    }

    const localOnlyId = '10000000-0000-4000-8000-000000000077';
    await database.tabs.add({
      id: localOnlyId,
      collectionId: firstCollection.id,
      title: 'Local only',
      url: 'https://example.com/local-only',
      hostname: 'example.com',
      normalizedHostname: 'example.com',
      pinned: false,
      position: 99,
      createdAt: '2026-07-19T12:00:00.000Z',
      lastAccessedAt: null,
      tagIds: [],
    });

    await importExportDocument(database, fixture);
    const exported = await exportDatabase(database);
    const tabs = exported.collections[0]?.tabs ?? [];
    expect(tabs.some((tab) => tab.id === localOnlyId)).toBe(true);
    expect(tabs).toHaveLength(firstCollection.tabs.length + 1);
  });

  it('rejects merges that move an existing tab onto another collection', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);

    const stolen = structuredClone(fixture);
    const firstTab = stolen.collections[0]?.tabs[0];
    expect(firstTab).toBeDefined();
    if (!firstTab || !stolen.collections[0]) {
      throw new Error('Fixture must contain a tab');
    }
    stolen.collections = [
      {
        ...stolen.collections[0],
        id: '10000000-0000-4000-8000-000000000088',
        name: 'Thief',
        tabs: [{ ...firstTab, tagIds: [] }],
        tags: [],
      },
    ];
    stolen.sessions = [];
    stolen.proposals = [];

    await expect(importExportDocument(database, stolen)).rejects.toThrow(
      /already belongs to another collection/,
    );
  });

  it('rejects merges that reuse a collection tab id in a session', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);

    const firstTab = fixture.collections[0]?.tabs[0];
    const firstSession = fixture.sessions[0];
    if (!firstTab || !firstSession) {
      throw new Error('Fixture must contain a tab and session');
    }
    const collision = structuredClone(fixture);
    collision.collections = [];
    collision.sessions = [
      {
        ...firstSession,
        tabs: [{ ...firstTab, tagIds: [] }],
      },
    ];
    collision.proposals = [];

    await expect(importExportDocument(database, collision)).rejects.toThrow(
      /already belongs to another collection or session/,
    );
    expectSemanticExport(await exportDatabase(database), fixture);
  });

  it('rejects a second tag id with the same collection-local name', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);

    const collection = fixture.collections[0];
    const firstTag = collection?.tags[0];
    if (!collection || !firstTag) {
      throw new Error('Fixture must contain a collection tag');
    }
    const collision = structuredClone(fixture);
    collision.collections = [
      {
        ...collection,
        tabs: [],
        tags: [
          {
            ...firstTag,
            id: '20000000-0000-4000-8000-000000000099',
          },
        ],
      },
    ];
    collision.sessions = [];
    collision.proposals = [];

    await expect(importExportDocument(database, collision)).rejects.toThrow(
      /already exists in this collection/,
    );
  });

  it('keeps local settings when merging an export', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);
    await database.settings.put({
      id: 'settings',
      theme: 'dark',
      defaultView: 'grid',
      includeFullUrlInAi: true,
      aiProvider: null,
      lastImportedAt: '2026-01-01T00:00:00.000Z',
    });

    await importExportDocument(database, fixture);
    await expect(database.settings.get('settings')).resolves.toMatchObject({
      theme: 'dark',
      defaultView: 'grid',
      includeFullUrlInAi: true,
    });
  });

  it('rolls back all writes when storage identities are invalid', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);

    const invalid = structuredClone(fixture);
    const duplicate = structuredClone(invalid.collections[0]);
    expect(duplicate).toBeDefined();
    if (!duplicate) {
      throw new Error('Fixture must contain a collection');
    }
    duplicate.id = '10000000-0000-4000-8000-000000000002';
    duplicate.name = 'Duplicate identities';
    invalid.collections.push(duplicate);

    await expect(importExportDocument(database, invalid)).rejects.toThrow();
    expectSemanticExport(await exportDatabase(database), fixture);
  });

  it('rejects secret-bearing input without changing persisted data', async () => {
    const database = createDatabase();
    const fixture = loadFixture();
    await importExportDocument(database, fixture);

    const secretBearingInput = structuredClone(fixture) as unknown as {
      settings: Record<string, unknown>;
    };
    // Test rejects unknown secret fields; value is intentional and unused.
    secretBearingInput.settings.apiKey = 'unused'; // pragma: allowlist secret

    await expect(
      importExportDocument(database, secretBearingInput),
    ).rejects.toThrow();
    expectSemanticExport(await exportDatabase(database), fixture);
    expect(await database.settings.get('settings')).not.toHaveProperty(
      'apiKey',
    );
  });
});

describe('Tabman database versions', () => {
  it('opens all current stores on a new database', async () => {
    const database = createDatabase();
    await database.open();

    expect(database.verno).toBe(DATABASE_VERSION);
    expect(database.tables.map((table) => table.name).sort()).toEqual([
      'collections',
      'corrections',
      'proposals',
      'sessions',
      'settings',
      'tabs',
      'tags',
    ]);
    expect(database.tabs.schema.idxByName.normalizedHostname).toBeDefined();
    expect(database.corrections).toBeDefined();
  });

  it('migrates version 1 tabs and populates the new index', async () => {
    const name = nextDatabaseName();
    const fixture = loadFixture();
    const collection = fixture.collections[0];
    const tab = collection?.tabs[0];
    expect(collection).toBeDefined();
    expect(tab).toBeDefined();
    if (!(collection && tab)) {
      throw new Error('Fixture must contain a collection tab');
    }

    const legacy = new Dexie(name);
    legacy.version(1).stores(VERSION_ONE_STORES);
    await legacy.open();
    await legacy.table<TabRecord>('tabs').add({
      ...tab,
      collectionId: collection.id,
    });
    legacy.close();

    const database = createDatabase(name);
    await database.open();

    expect(database.verno).toBe(DATABASE_VERSION);
    expect(await database.tabs.get(tab.id)).toMatchObject({
      normalizedHostname: 'developer.chrome.com',
    });
    expect(
      await database.tabs
        .where('normalizedHostname')
        .equals('developer.chrome.com')
        .primaryKeys(),
    ).toEqual([tab.id]);
  });
});
