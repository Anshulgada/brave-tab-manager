import 'fake-indexeddb/auto';

import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleSwitchboardRequest } from '../src/background-service';
import { DEFAULT_DATABASE_NAME, TabmanDatabase } from '../src/database';
import { exportDatabase } from '../src/import-export';

const openDatabases: TabmanDatabase[] = [];

function tab(id: number, windowId = 1) {
  return {
    id,
    windowId,
    index: id - 1,
    title: `Tab ${id}`,
    url: `https://example${id}.com/path`,
    favIconUrl: `https://example${id}.com/favicon.ico`,
    pinned: false,
    active: id === 1,
    audible: false,
    discarded: false,
    groupId: -1,
    incognito: false,
    highlighted: false,
    selected: false,
    autoDiscardable: true,
  };
}

function installBrowserMock() {
  const tabsById = new Map([
    [1, tab(1)],
    [2, tab(2)],
    [3, tab(3, 2)],
  ]);
  const mock = {
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getURL: vi.fn((path: string) => `chrome-extension://tabman${path}`),
    },
    tabs: {
      get: vi.fn(async (tabId: number) => {
        const item = tabsById.get(tabId);
        if (!item) {
          throw new Error('Tab not found');
        }
        return item;
      }),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn().mockResolvedValue(undefined),
      move: vi.fn().mockResolvedValue(undefined),
      group: vi.fn().mockResolvedValue(12),
      create: vi.fn().mockResolvedValue(undefined),
    },
    windows: {
      getAll: vi.fn().mockResolvedValue([
        {
          id: 1,
          focused: true,
          incognito: false,
          type: 'normal',
          tabs: [tabsById.get(1), tabsById.get(2)],
        },
        {
          id: 2,
          focused: false,
          incognito: false,
          type: 'normal',
          tabs: [tabsById.get(3)],
        },
      ]),
      update: vi.fn().mockResolvedValue(undefined),
    },
    tabGroups: {
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
  vi.stubGlobal('browser', mock);
  return mock;
}

beforeEach(async () => {
  await Dexie.delete(DEFAULT_DATABASE_NAME);
});

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    database.close();
  }
  await Dexie.delete(DEFAULT_DATABASE_NAME);
  vi.unstubAllGlobals();
});

describe('background switchboard service', () => {
  it('queries every normal browser window', async () => {
    const browserMock = installBrowserMock();

    const response = await handleSwitchboardRequest({
      type: 'switchboard/get',
    });

    expect(browserMock.windows.getAll).toHaveBeenCalledWith({
      populate: true,
      windowTypes: ['normal'],
    });
    expect(response).toMatchObject({
      ok: true,
      snapshot: { tabCount: 3 },
    });
  });

  it('activates the tab before focusing its window', async () => {
    const browserMock = installBrowserMock();

    await expect(
      handleSwitchboardRequest({
        type: 'switchboard/activate',
        tabId: 3,
        windowId: 2,
      }),
    ).resolves.toEqual({ ok: true });

    expect(browserMock.tabs.update).toHaveBeenCalledWith(3, { active: true });
    expect(browserMock.windows.update).toHaveBeenCalledWith(2, {
      focused: true,
    });
  });

  it('persists a selection before closing its browser tabs', async () => {
    const browserMock = installBrowserMock();

    const response = await handleSwitchboardRequest({
      type: 'switchboard/park',
      tabIds: [1, 2],
      name: 'Focused research',
    });
    const database = new TabmanDatabase();
    openDatabases.push(database);

    expect(response).toEqual({ ok: true, affected: 2 });
    expect(await database.collections.toArray()).toMatchObject([
      { name: 'Focused research', status: 'active' },
    ]);
    expect(await database.tabs.count()).toBe(2);
    await expect(exportDatabase(database)).resolves.toMatchObject({
      collections: [{ name: 'Focused research' }],
      settings: { theme: 'system', defaultView: 'list' },
    });
    expect(browserMock.tabs.remove).toHaveBeenCalledTimes(2);
    expect(browserMock.tabs.remove).toHaveBeenNthCalledWith(1, 1);
    expect(browserMock.tabs.remove).toHaveBeenNthCalledWith(2, 2);
  });
});
