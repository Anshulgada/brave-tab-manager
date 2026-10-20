import type {
  CollectionRecord,
  SettingsRecord,
  TabmanDatabase,
  TabRecord,
  TagRecord,
} from './database';
import { exportDatabase, importExportDocument } from './import-export';
import type { ExportDocument, Settings } from './schema';

export interface LibraryCollection extends CollectionRecord {
  tabs: TabRecord[];
  tags: TagRecord[];
}

export interface LibrarySnapshot {
  collections: LibraryCollection[];
  settings: SettingsRecord;
}

export interface RestoreResult {
  restored: number;
  failures: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  defaultView: 'list',
  includeFullUrlInAi: false,
  aiProvider: null,
};

export async function ensureSettings(
  database: TabmanDatabase,
): Promise<SettingsRecord> {
  return database.transaction('rw', database.settings, async () => {
    const existing = await database.settings.get('settings');
    if (existing) {
      return existing;
    }
    const settings: SettingsRecord = {
      id: 'settings',
      lastImportedAt: new Date().toISOString(),
      ...DEFAULT_SETTINGS,
    };
    await database.settings.add(settings);
    return settings;
  });
}

export async function loadLibrary(
  database: TabmanDatabase,
): Promise<LibrarySnapshot> {
  await ensureSettings(database);
  return database.transaction(
    'r',
    [database.collections, database.tabs, database.tags, database.settings],
    async () => {
      const [collections, tabs, tags, settings] = await Promise.all([
        database.collections.toArray(),
        database.tabs.toArray(),
        database.tags.toArray(),
        database.settings.get('settings'),
      ]);
      if (!settings) {
        throw new Error('Library settings are unavailable');
      }
      const parking = new Set(settings.parkingCollectionIds ?? []);
      const tabsByCollection = new Map<string, TabRecord[]>();
      for (const tab of tabs) {
        const collectionTabs = tabsByCollection.get(tab.collectionId) ?? [];
        collectionTabs.push(tab);
        tabsByCollection.set(tab.collectionId, collectionTabs);
      }
      const tagsByCollection = new Map<string, TagRecord[]>();
      for (const tag of tags) {
        const collectionTags = tagsByCollection.get(tag.collectionId) ?? [];
        collectionTags.push(tag);
        tagsByCollection.set(tag.collectionId, collectionTags);
      }
      return {
        collections: collections
          .filter((collection) => !parking.has(collection.id))
          .sort(
            (left, right) =>
              Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
              left.id.localeCompare(right.id),
          )
          .map((collection) => ({
            ...collection,
            tabs: (tabsByCollection.get(collection.id) ?? []).sort(
              (left, right) =>
                left.position - right.position ||
                left.id.localeCompare(right.id),
            ),
            tags: (tagsByCollection.get(collection.id) ?? []).sort(
              (left, right) =>
                (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
                left.name.localeCompare(right.name),
            ),
          })),
        settings,
      };
    },
  );
}

export async function createCollection(
  database: TabmanDatabase,
  name: string,
): Promise<string> {
  const cleanName = name.trim().slice(0, 120);
  if (!cleanName) {
    throw new Error('Collection name is required');
  }
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await database.collections.add({
    id,
    name: cleanName,
    description: null,
    color: null,
    createdAt: now,
    updatedAt: now,
    status: 'active',
  });
  await ensureSettings(database);
  return id;
}

export async function renameCollection(
  database: TabmanDatabase,
  collectionId: string,
  name: string,
): Promise<void> {
  const cleanName = name.trim().slice(0, 120);
  if (!cleanName) {
    throw new Error('Collection name is required');
  }
  const updated = await database.collections.update(collectionId, {
    name: cleanName,
    updatedAt: new Date().toISOString(),
  });
  if (!updated) {
    throw new Error('Collection no longer exists');
  }
}

export async function setCollectionStatus(
  database: TabmanDatabase,
  collectionIds: string[],
  status: CollectionRecord['status'],
): Promise<void> {
  const ids = [...new Set(collectionIds)];
  const now = new Date().toISOString();
  await database.transaction('rw', database.collections, async () => {
    for (const collectionId of ids) {
      await database.collections.update(collectionId, {
        status,
        updatedAt: now,
      });
    }
  });
}

export async function permanentlyDeleteCollections(
  database: TabmanDatabase,
  collectionIds: string[],
): Promise<void> {
  const ids = [...new Set(collectionIds)];
  await database.transaction(
    'rw',
    [database.collections, database.tabs, database.tags, database.settings],
    async () => {
      const settings = await database.settings.get('settings');
      const parking = new Set(settings?.parkingCollectionIds ?? []);
      const blocked = ids.filter((collectionId) => parking.has(collectionId));
      if (blocked.length > 0) {
        throw new Error(
          'Cannot permanently delete a collection while its tabs are still being parked',
        );
      }
      for (const collectionId of ids) {
        await database.tabs.where('collectionId').equals(collectionId).delete();
        await database.tags.where('collectionId').equals(collectionId).delete();
      }
      await database.collections.bulkDelete(ids);
    },
  );
}

export async function deleteTabs(
  database: TabmanDatabase,
  tabIds: string[],
): Promise<void> {
  const ids = [...new Set(tabIds)];
  await database.transaction(
    'rw',
    [database.tabs, database.collections, database.settings],
    async () => {
      const records = await database.tabs.bulkGet(ids);
      const settings = await database.settings.get('settings');
      const parking = new Set(settings?.parkingCollectionIds ?? []);
      if (records.some((tab) => tab && parking.has(tab.collectionId))) {
        throw new Error(
          'Cannot delete tabs while their collection is still being parked',
        );
      }
      const collectionIds = new Set(
        records.flatMap((tab) => (tab ? [tab.collectionId] : [])),
      );
      await database.tabs.bulkDelete(ids);
      const now = new Date().toISOString();
      for (const collectionId of collectionIds) {
        await database.collections.update(collectionId, { updatedAt: now });
      }
    },
  );
}

export async function tagTabs(
  database: TabmanDatabase,
  tabIds: string[],
  tagName: string,
): Promise<void> {
  const name = tagName.trim().slice(0, 64);
  if (!name) {
    throw new Error('Tag name is required');
  }
  const ids = [...new Set(tabIds)];

  await database.transaction(
    'rw',
    [database.tabs, database.tags, database.collections],
    async () => {
      const tabs = (await database.tabs.bulkGet(ids)).flatMap((tab) =>
        tab ? [tab] : [],
      );
      if (tabs.length === 0) {
        throw new Error('Select at least one saved tab');
      }
      const now = new Date().toISOString();
      const collectionIds = new Set(tabs.map((tab) => tab.collectionId));
      for (const collectionId of collectionIds) {
        const existing = await database.tags
          .where('collectionId')
          .equals(collectionId)
          .filter(
            (tag) => tag.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          )
          .first();
        const tagId = existing?.id ?? crypto.randomUUID();
        if (!existing) {
          await database.tags.add({
            id: tagId,
            collectionId,
            name,
            color: null,
            sortOrder: await database.tags
              .where('collectionId')
              .equals(collectionId)
              .count(),
          });
        }
        for (const tab of tabs.filter(
          (item) => item.collectionId === collectionId,
        )) {
          const current = await database.tabs.get(tab.id);
          if (!current) {
            continue;
          }
          await database.tabs.update(tab.id, {
            tagIds: [...new Set([...current.tagIds, tagId])],
          });
        }
        await database.collections.update(collectionId, { updatedAt: now });
      }
    },
  );
}

async function remapTagsForMove(
  database: TabmanDatabase,
  tabs: TabRecord[],
  targetCollectionId: string,
): Promise<Map<string, string>> {
  const remap = new Map<string, string>();
  const sourceTagIds = [...new Set(tabs.flatMap((tab) => tab.tagIds))];
  if (sourceTagIds.length === 0) {
    return remap;
  }

  const sourceTags = (await database.tags.bulkGet(sourceTagIds)).flatMap(
    (tag) => (tag ? [tag] : []),
  );
  const targetTags = await database.tags
    .where('collectionId')
    .equals(targetCollectionId)
    .toArray();
  const targetByName = new Map(
    targetTags.map((tag) => [tag.name.toLocaleLowerCase(), tag] as const),
  );

  for (const sourceTag of sourceTags) {
    const key = sourceTag.name.toLocaleLowerCase();
    let targetTag = targetByName.get(key);
    if (!targetTag) {
      targetTag = {
        id: crypto.randomUUID(),
        collectionId: targetCollectionId,
        name: sourceTag.name,
        color: sourceTag.color,
        sortOrder: await database.tags
          .where('collectionId')
          .equals(targetCollectionId)
          .count(),
      };
      await database.tags.add(targetTag);
      targetByName.set(key, targetTag);
    }
    remap.set(sourceTag.id, targetTag.id);
  }
  return remap;
}

export async function moveTabs(
  database: TabmanDatabase,
  tabIds: string[],
  targetCollectionId: string,
): Promise<void> {
  const ids = [...new Set(tabIds)];
  await database.transaction(
    'rw',
    [database.tabs, database.collections, database.tags],
    async () => {
      const target = await database.collections.get(targetCollectionId);
      if (target?.status !== 'active') {
        throw new Error('Choose an active destination collection');
      }
      const tabs = (await database.tabs.bulkGet(ids)).flatMap((tab) =>
        tab ? [tab] : [],
      );
      if (tabs.length === 0) {
        throw new Error('Select at least one saved tab');
      }
      const sourceCollectionIds = new Set(tabs.map((tab) => tab.collectionId));
      const targetCount = await database.tabs
        .where('collectionId')
        .equals(targetCollectionId)
        .count();
      const tagRemap = await remapTagsForMove(
        database,
        tabs,
        targetCollectionId,
      );
      await database.tabs.bulkPut(
        tabs.map((tab, index) => ({
          ...tab,
          collectionId: targetCollectionId,
          position: targetCount + index,
          tagIds: [
            ...new Set(
              tab.tagIds.flatMap((tagId) => {
                const remapped = tagRemap.get(tagId);
                return remapped ? [remapped] : [];
              }),
            ),
          ],
        })),
      );
      const now = new Date().toISOString();
      for (const collectionId of sourceCollectionIds) {
        await database.collections.update(collectionId, { updatedAt: now });
      }
      await database.collections.update(targetCollectionId, { updatedAt: now });
    },
  );
}

function isRestorableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function restoreFailureLabel(tab: Pick<TabRecord, 'title' | 'url'>): string {
  const label = tab.title || tab.url;
  if (!isRestorableUrl(tab.url)) {
    return `${label} (http/https only)`;
  }
  return label;
}

export async function restoreTabs(
  tabs: Pick<TabRecord, 'title' | 'url' | 'pinned'>[],
): Promise<RestoreResult> {
  const failures: string[] = [];
  let restored = 0;
  for (const tab of tabs) {
    if (!isRestorableUrl(tab.url)) {
      failures.push(restoreFailureLabel(tab));
      continue;
    }
    try {
      await browser.tabs.create({ url: tab.url, pinned: tab.pinned });
      restored += 1;
    } catch {
      failures.push(restoreFailureLabel(tab));
    }
  }
  return { restored, failures };
}

export async function importLibrary(
  database: TabmanDatabase,
  input: unknown,
  replace: boolean,
): Promise<ExportDocument> {
  return importExportDocument(database, input, { replace });
}

export async function exportLibrary(
  database: TabmanDatabase,
): Promise<ExportDocument> {
  await ensureSettings(database);
  return exportDatabase(database);
}

export async function updateSettings(
  database: TabmanDatabase,
  settings: Settings,
): Promise<void> {
  const existing = await ensureSettings(database);
  await database.settings.put({ ...existing, ...settings, id: 'settings' });
}
