/**
 * Collect the open tabs into the library without closing them.
 *
 * Parking moves tabs into the library and closes them. Collecting keeps
 * them open, which is the gentlest way to snapshot what you are working on.
 */

import { TabmanDatabase, type TabRecord } from './database';
import { notifyLibraryChanged } from './notify';
import { collectionSchema, tabSchema } from './schema';

export class CollectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectError';
  }
}

function cleanName(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim().slice(0, 120);
  return trimmed || fallback;
}

/**
 * Save every open tab into a new collection and leave the browser alone.
 *
 * When a collection id is given and that collection is empty, the tabs are
 * appended to it instead of creating a second collection. That keeps the
 * common flow simple: make a collection, then collect into it.
 */
export async function collectOpenTabs(
  name: string | undefined,
  collectionId?: string,
): Promise<{
  ok: true;
  affected: number;
  collectionId: string;
  collectionName: string;
  warnings?: string[];
}> {
  const browserTabs = await browser.tabs.query({});
  const now = new Date().toISOString();
  const warnings: string[] = [];
  const records: TabRecord[] = [];

  for (const source of browserTabs) {
    if (source.incognito || source.id === undefined || !source.url) {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(source.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue;
    }
    try {
      const tab = tabSchema.parse({
        id: crypto.randomUUID(),
        title: (source.title ?? parsed.hostname).slice(0, 2048),
        url: source.url,
        hostname: parsed.hostname.slice(0, 253),
        ...(source.favIconUrl ? { favIconUrl: source.favIconUrl } : {}),
        pinned: source.pinned,
        position: records.length,
        createdAt: now,
        lastAccessedAt: null,
        tagIds: [],
      });
      records.push({
        ...tab,
        collectionId: collectionId ?? crypto.randomUUID(),
        normalizedHostname: tab.hostname.toLocaleLowerCase(),
      });
    } catch {
      warnings.push(`${source.title || source.url} could not be collected`);
    }
  }

  if (records.length === 0) {
    throw new CollectError('There are no open tabs to collect');
  }

  const database = new TabmanDatabase();
  let targetCollectionId!: string;
  let collectionName!: string;
  try {
    await database.transaction(
      'rw',
      [database.collections, database.tabs],
      async () => {
        const existing = collectionId
          ? await database.collections.get(collectionId)
          : undefined;
        if (existing && existing.status === 'active') {
          const existingTabs = await database.tabs
            .where('collectionId')
            .equals(existing.id)
            .toArray();
          if (existingTabs.length === 0) {
            const taggedRecords = records.map((record, index) => ({
              ...record,
              collectionId: existing.id,
              position: index,
            }));
            await database.collections.put({
              ...existing,
              name: cleanName(name, existing.name),
              updatedAt: now,
            });
            await database.tabs.bulkAdd(taggedRecords);
            targetCollectionId = existing.id;
            collectionName = cleanName(name, existing.name);
            return;
          }
        }

        targetCollectionId = collectionId ?? crypto.randomUUID();
        collectionName = cleanName(
          name,
          `Collected ${new Date().toLocaleDateString()}`,
        );
        const collection = collectionSchema.parse({
          id: targetCollectionId,
          name: collectionName,
          description: 'Every tab that was open when this collection was made.',
          color: null,
          createdAt: now,
          updatedAt: now,
          status: 'active',
          tags: [],
          tabs: records.map(
            ({
              collectionId: _collectionId,
              normalizedHostname: _hostname,
              ...tab
            }) => tab,
          ),
        });
        const { tabs: _tabs, tags: _tags, ...collectionRecord } = collection;
        const taggedRecords = records.map((record, index) => ({
          ...record,
          collectionId: targetCollectionId,
          position: index,
        }));
        await database.collections.add(collectionRecord);
        await database.tabs.bulkAdd(taggedRecords);
      },
    );
  } finally {
    database.close();
  }
  await notifyLibraryChanged();
  return {
    ok: true,
    affected: records.length,
    collectionId: targetCollectionId,
    collectionName,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
