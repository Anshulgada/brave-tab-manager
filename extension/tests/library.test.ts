import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TabmanDatabase, type TabRecord } from '../src/database';
import {
  createCollection,
  deleteTabs,
  exportLibrary,
  loadLibrary,
  moveTabs,
  permanentlyDeleteCollections,
  restoreTabs,
  setCollectionStatus,
  tagTabs,
  updateSettings,
} from '../src/library';

let databaseCounter = 0;
const databases: TabmanDatabase[] = [];

function createDatabase(): TabmanDatabase {
  databaseCounter += 1;
  const database = new TabmanDatabase(`tabman-library-test-${databaseCounter}`);
  databases.push(database);
  return database;
}

function tabRecord(
  id: string,
  collectionId: string,
  position: number,
): TabRecord {
  return {
    id,
    collectionId,
    title: `Saved tab ${position + 1}`,
    url: `https://example.com/${position + 1}`,
    hostname: 'example.com',
    normalizedHostname: 'example.com',
    pinned: false,
    position,
    createdAt: '2026-07-19T12:00:00.000Z',
    lastAccessedAt: null,
    tagIds: [],
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const database of databases.splice(0)) {
    const name = database.name;
    database.close();
    await Dexie.delete(name);
  }
});

describe('local collection library', () => {
  it('initializes settings safely across concurrent dashboard loads', async () => {
    const database = createDatabase();

    const [first, second] = await Promise.all([
      loadLibrary(database),
      loadLibrary(database),
    ]);

    expect(first.settings).toEqual(second.settings);
    expect(await database.settings.count()).toBe(1);
  });

  it('creates an exportable collection with default settings', async () => {
    const database = createDatabase();

    const collectionId = await createCollection(database, ' Reading list ');
    await database.tabs.add(
      tabRecord('10000000-0000-4000-8000-000000000001', collectionId, 0),
    );

    const snapshot = await loadLibrary(database);
    const exported = await exportLibrary(database);

    expect(snapshot.collections[0]).toMatchObject({
      id: collectionId,
      name: 'Reading list',
      tabs: [{ title: 'Saved tab 1' }],
    });
    expect(snapshot.settings).toMatchObject({
      theme: 'system',
      defaultView: 'list',
    });
    expect(exported.collections[0]?.name).toBe('Reading list');
  });

  it('tags and moves tabs while preserving schema relationships', async () => {
    const database = createDatabase();
    const sourceId = await createCollection(database, 'Source');
    const targetId = await createCollection(database, 'Target');
    const tabId = '10000000-0000-4000-8000-000000000002';
    await database.tabs.add(tabRecord(tabId, sourceId, 0));

    await tagTabs(database, [tabId], 'Research');
    const tagged = await database.tabs.get(tabId);
    expect(tagged?.tagIds).toHaveLength(1);
    expect(await database.tags.count()).toBe(1);

    await moveTabs(database, [tabId], targetId);
    expect(await database.tabs.get(tabId)).toMatchObject({
      collectionId: targetId,
      tagIds: [],
    });
  });

  it('supports tab deletion and recoverable collection trash', async () => {
    const database = createDatabase();
    const collectionId = await createCollection(database, 'Temporary');
    const tabId = '10000000-0000-4000-8000-000000000003';
    await database.tabs.add(tabRecord(tabId, collectionId, 0));

    await deleteTabs(database, [tabId]);
    expect(await database.tabs.count()).toBe(0);

    await setCollectionStatus(database, [collectionId], 'trashed');
    expect(await database.collections.get(collectionId)).toMatchObject({
      status: 'trashed',
    });

    await permanentlyDeleteCollections(database, [collectionId]);
    expect(await database.collections.count()).toBe(0);
  });

  it('reports partial restore failures without stopping the batch', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('blocked'));
    vi.stubGlobal('browser', { tabs: { create } });

    const result = await restoreTabs([
      {
        title: 'Restorable',
        url: 'https://example.com/one',
        pinned: false,
      },
      {
        title: 'Blocked',
        url: 'chrome://settings/',
        pinned: false,
      },
    ]);

    expect(result).toEqual({ restored: 1, failures: ['Blocked'] });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('persists appearance and privacy controls', async () => {
    const database = createDatabase();
    await createCollection(database, 'Settings owner');
    const snapshot = await loadLibrary(database);

    await updateSettings(database, {
      ...snapshot.settings,
      theme: 'dark',
      defaultView: 'grid',
      includeFullUrlInAi: true,
    });

    await expect(loadLibrary(database)).resolves.toMatchObject({
      settings: {
        theme: 'dark',
        defaultView: 'grid',
        includeFullUrlInAi: true,
      },
    });
  });
});
