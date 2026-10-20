import Dexie, { type EntityTable, type Transaction } from 'dexie';

import type {
  Collection,
  Proposal,
  Session,
  Settings,
  Tab,
  Tag,
} from './schema';

export const DATABASE_VERSION = 2;
export const DEFAULT_DATABASE_NAME = 'tabman';

export const VERSION_ONE_STORES = {
  collections: '&id, status, createdAt',
  tabs: '&id, collectionId, position, hostname',
  tags: '&id, collectionId, name',
  sessions: '&id, capturedAt',
  proposals: '&id, status, createdAt',
  settings: '&id',
} as const;

export const VERSION_TWO_STORES = {
  tabs: '&id, collectionId, position, hostname, normalizedHostname',
} as const;

export interface CollectionRecord extends Omit<Collection, 'tabs' | 'tags'> {
  sortOrder?: number;
}

export interface TabRecord extends Tab {
  collectionId: string;
  /**
   * Optional so records written by database version 1 can be represented while
   * the version 2 upgrade populates the field.
   */
  normalizedHostname?: string;
}

export interface TagRecord extends Tag {
  collectionId: string;
  sortOrder?: number;
}

export interface SessionRecord extends Session {
  sortOrder?: number;
}

export interface ProposalRecord extends Proposal {
  sortOrder?: number;
}

export interface SettingsRecord extends Settings {
  id: 'settings';
  /** Timestamp of the last imported export document. */
  lastImportedAt: string;
  /** Collection IDs mid-park; not part of the shared export contract. */
  parkingCollectionIds?: string[];
}

export function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

export class TabmanDatabase extends Dexie {
  collections!: EntityTable<CollectionRecord, 'id'>;
  tabs!: EntityTable<TabRecord, 'id'>;
  tags!: EntityTable<TagRecord, 'id'>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  proposals!: EntityTable<ProposalRecord, 'id'>;
  settings!: EntityTable<SettingsRecord, 'id'>;

  constructor(databaseName = DEFAULT_DATABASE_NAME) {
    super(databaseName);

    this.version(1).stores(VERSION_ONE_STORES);
    this.version(DATABASE_VERSION)
      .stores(VERSION_TWO_STORES)
      .upgrade((transaction: Transaction) =>
        transaction
          .table<TabRecord>('tabs')
          .toCollection()
          .modify((tab) => {
            tab.normalizedHostname = normalizeHostname(tab.hostname);
          }),
      );
  }
}
