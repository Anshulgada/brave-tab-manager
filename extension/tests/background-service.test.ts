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

function installBrowserMock(options?: {
  pinnedIds?: number[];
  removeRejectIds?: number[];
}) {
  const pinnedIds = new Set(options?.pinnedIds ?? []);
  const removeRejectIds = new Set(options?.removeRejectIds ?? []);
  const tabsById = new Map([
    [1, { ...tab(1), pinned: pinnedIds.has(1) }],
    [2, { ...tab(2), pinned: pinnedIds.has(2) }],
    [3, { ...tab(3, 2), pinned: pinnedIds.has(3) }],
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
      remove: vi.fn(async (tabId: number) => {
        if (removeRejectIds.has(tabId)) {
          throw new Error('remove failed');
        }
      }),
      discard: vi.fn().mockResolvedValue(undefined),
      move: vi.fn(
        async (tabIds: number | number[], props: { index: number }) => {
          const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
          return ids.map((id) => ({
            ...(tabsById.get(id) ?? tab(id)),
            id,
            index: props.index,
          }));
        },
      ),
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

  it('activates using the tab live window instead of a stale snapshot id', async () => {
    const browserMock = installBrowserMock();
    browserMock.tabs.get.mockResolvedValue({
      ...tab(3, 2),
      windowId: 1,
    });

    await expect(
      handleSwitchboardRequest({
        type: 'switchboard/activate',
        tabId: 3,
        windowId: 2,
      }),
    ).resolves.toEqual({ ok: true });

    expect(browserMock.windows.update).toHaveBeenCalledWith(1, {
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

  it('rejects invalid action payloads instead of closing tabs', async () => {
    const browserMock = installBrowserMock();

    await expect(
      handleSwitchboardRequest({
        type: 'switchboard/action',
        action: 'explode',
        tabIds: [1],
      }),
    ).resolves.toMatchObject({ ok: false });
    expect(browserMock.tabs.remove).not.toHaveBeenCalled();
  });

  it('reports partial close failures without aborting the batch', async () => {
    installBrowserMock({ removeRejectIds: [2] });

    await expect(
      handleSwitchboardRequest({
        type: 'switchboard/action',
        action: 'close',
        tabIds: [1, 2],
      }),
    ).resolves.toEqual({
      ok: true,
      affected: 1,
      warnings: ['Tab 2 could not be closed'],
    });
  });

  it('moves pinned tabs ahead of unpinned tabs', async () => {
    const browserMock = installBrowserMock({ pinnedIds: [1] });

    await expect(
      handleSwitchboardRequest({
        type: 'switchboard/move',
        tabIds: [1, 2],
        windowId: 2,
      }),
    ).resolves.toEqual({ ok: true, affected: 2 });

    expect(browserMock.tabs.move).toHaveBeenNthCalledWith(1, [1], {
      windowId: 2,
      index: 0,
    });
    expect(browserMock.tabs.move).toHaveBeenNthCalledWith(2, [2], {
      windowId: 2,
      index: -1,
    });
  });

  it('refuses to park tabs from an incognito window', async () => {
    const browserMock = installBrowserMock();
    browserMock.tabs.get.mockImplementation(async (tabId: number) => ({
      ...tab(tabId),
      incognito: true,
    }));

    await expect(
      handleSwitchboardRequest({
        type: 'switchboard/park',
        tabIds: [1],
        name: 'Private stash',
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: 'None of the selected tabs can be parked',
    });
    expect(browserMock.tabs.remove).not.toHaveBeenCalled();
    const database = new TabmanDatabase();
    openDatabases.push(database);
    expect(await database.tabs.count()).toBe(0);
  });
});
