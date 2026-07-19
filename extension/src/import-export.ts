import {
  type CollectionRecord,
  normalizeHostname,
  type ProposalRecord,
  type SessionRecord,
  type SettingsRecord,
  type TabmanDatabase,
  type TabRecord,
  type TagRecord,
} from './database';
import {
  type ExportDocument,
  type Proposal,
  parseExportDocument,
  type Session,
  type Tab,
  type Tag,
} from './schema';

const SETTINGS_ID = 'settings' as const;

export interface ImportOptions {
  replace?: boolean;
}

function withoutRecordFields(record: TabRecord): Tab {
  const {
    collectionId: _collectionId,
    normalizedHostname: _normalizedHostname,
    ...tab
  } = record;
  return tab;
}

function withoutRecordFieldsFromTag(record: TagRecord): Tag {
  const { collectionId: _collectionId, sortOrder: _sortOrder, ...tag } = record;
  return tag;
}

function withoutRecordFieldsFromSession(record: SessionRecord): Session {
  const { sortOrder: _sortOrder, ...session } = record;
  return session;
}

function withoutRecordFieldsFromProposal(record: ProposalRecord): Proposal {
  const { sortOrder: _sortOrder, ...proposal } = record;
  return proposal;
}

/**
 * Import a validated export. By default merges by stable IDs; pass
 * `{ replace: true }` to wipe local state first.
 */
export async function importExportDocument(
  database: TabmanDatabase,
  input: unknown,
  options: ImportOptions = {},
): Promise<ExportDocument> {
  const document = parseExportDocument(input);
  const replace = options.replace === true;

  const collections: CollectionRecord[] = document.collections.map(
    ({ tabs: _tabs, tags: _tags, ...collection }, sortOrder) => ({
      ...collection,
      sortOrder,
    }),
  );
  const tabs: TabRecord[] = document.collections.flatMap((collection) =>
    collection.tabs.map((tab) => ({
      ...tab,
      collectionId: collection.id,
      normalizedHostname: normalizeHostname(tab.hostname),
    })),
  );
  const tags: TagRecord[] = document.collections.flatMap((collection) =>
    collection.tags.map((tag, sortOrder) => ({
      ...tag,
      collectionId: collection.id,
      sortOrder,
    })),
  );
  const sessions: SessionRecord[] = document.sessions.map(
    (session, sortOrder) => ({ ...session, sortOrder }),
  );
  const proposals: ProposalRecord[] = document.proposals.map(
    (proposal, sortOrder) => ({ ...proposal, sortOrder }),
  );
  const settings: SettingsRecord = {
    ...document.settings,
    id: SETTINGS_ID,
    lastImportedAt: document.exportedAt,
  };

  const tables = [
    database.collections,
    database.tabs,
    database.tags,
    database.sessions,
    database.proposals,
    database.settings,
  ];

  await database.transaction('rw', tables, async () => {
    if (replace) {
      await Promise.all(tables.map((table) => table.clear()));
    } else {
      for (const collection of document.collections) {
        await database.tabs
          .where('collectionId')
          .equals(collection.id)
          .delete();
        await database.tags
          .where('collectionId')
          .equals(collection.id)
          .delete();
      }
    }
    await database.collections.bulkPut(collections);
    await database.tabs.bulkPut(tabs);
    await database.tags.bulkPut(tags);
    await database.sessions.bulkPut(sessions);
    await database.proposals.bulkPut(proposals);
    await database.settings.put(settings);
  });

  return document;
}

/**
 * Reads a transactionally consistent snapshot and converts internal normalized
 * records back to the strict shared export contract.
 */
export async function exportDatabase(
  database: TabmanDatabase,
): Promise<ExportDocument> {
  return database.transaction(
    'r',
    [
      database.collections,
      database.tabs,
      database.tags,
      database.sessions,
      database.proposals,
      database.settings,
    ],
    async () => {
      const [
        collectionRecords,
        tabRecords,
        tagRecords,
        sessionRecords,
        proposalRecords,
        settingsRecord,
      ] = await Promise.all([
        database.collections.toArray(),
        database.tabs.toArray(),
        database.tags.toArray(),
        database.sessions.toArray(),
        database.proposals.toArray(),
        database.settings.get(SETTINGS_ID),
      ]);

      if (!settingsRecord) {
        throw new Error('Cannot export an uninitialized Tabman database');
      }

      const collectionIds = new Set(collectionRecords.map((item) => item.id));
      const orphanTabs = tabRecords.filter(
        (tab) => !collectionIds.has(tab.collectionId),
      );
      const orphanTags = tagRecords.filter(
        (tag) => !collectionIds.has(tag.collectionId),
      );
      if (orphanTabs.length > 0 || orphanTags.length > 0) {
        throw new Error('Cannot export database with orphaned tabs or tags');
      }

      const collections = collectionRecords
        .sort(
          (left, right) =>
            (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
            left.id.localeCompare(right.id),
        )
        .map((record) => {
          const { sortOrder: _sortOrder, ...collection } = record;
          const tags = tagRecords
            .filter((tag) => tag.collectionId === record.id)
            .sort(
              (left, right) =>
                (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
                left.id.localeCompare(right.id),
            )
            .map(withoutRecordFieldsFromTag);
          const tabs = tabRecords
            .filter((tab) => tab.collectionId === record.id)
            .sort(
              (left, right) =>
                left.position - right.position ||
                left.id.localeCompare(right.id),
            )
            .map(withoutRecordFields);

          return { ...collection, tags, tabs };
        });
      const sessions = sessionRecords
        .sort(
          (left, right) =>
            (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
            left.id.localeCompare(right.id),
        )
        .map(withoutRecordFieldsFromSession);
      const proposals = proposalRecords
        .sort(
          (left, right) =>
            (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
            left.id.localeCompare(right.id),
        )
        .map(withoutRecordFieldsFromProposal);
      const {
        id: _id,
        lastImportedAt: _lastImportedAt,
        ...settings
      } = settingsRecord;

      return parseExportDocument({
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        collections,
        sessions,
        proposals,
        settings,
      });
    },
  );
}
