import { normalizeHostname, TabmanDatabase, type TabRecord } from './database';
import {
  errorResponse,
  parseSwitchboardRequest,
  type SwitchboardResponse,
} from './messages';
import { collectionSchema, tabSchema } from './schema';
import { buildSwitchboardSnapshot } from './switchboard';

const MAX_COLLECTION_NAME_LENGTH = 120;

function uniqueTabIds(tabIds: number[]): number[] {
  return [...new Set(tabIds)].filter(Number.isInteger);
}

function requireTabIds(tabIds: number[]): number[] {
  const unique = uniqueTabIds(tabIds);
  if (unique.length === 0) {
    throw new Error('Select at least one tab');
  }
  return unique;
}

function cleanName(value: string, fallback: string): string {
  const name = value.trim() || fallback;
  return name.slice(0, MAX_COLLECTION_NAME_LENGTH);
}

function supportedAddress(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const protocol = new URL(value).protocol;
    return [
      'http:',
      'https:',
      'chrome:',
      'chrome-extension:',
      'brave:',
      'edge:',
      'about:',
    ].includes(protocol)
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

function parkableAddress(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function notifySwitchboardChanged(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'switchboard/changed' });
  } catch {
    // No switchboard surface is currently listening.
  }
}

async function notifyLibraryChanged(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'library/changed' });
  } catch {
    // No library surface is currently listening.
  }
}

async function getSnapshot(): Promise<SwitchboardResponse> {
  const windows = await browser.windows.getAll({
    populate: true,
    windowTypes: ['normal'],
  });
  return {
    ok: true,
    snapshot: buildSwitchboardSnapshot(windows),
  };
}

async function settleTabIds(
  tabIds: number[],
  action: (tabId: number) => Promise<unknown>,
  verb: string,
): Promise<SwitchboardResponse> {
  const unique = requireTabIds(tabIds);
  const results = await Promise.allSettled(
    unique.map((tabId) => action(tabId)),
  );
  const warnings = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [`Tab ${unique[index] ?? 'unknown'} could not be ${verb}`]
      : [],
  );
  await notifySwitchboardChanged();
  return {
    ok: true,
    affected: results.length - warnings.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function discardTabs(tabIds: number[]): Promise<SwitchboardResponse> {
  return settleTabIds(
    tabIds,
    (tabId) => browser.tabs.discard(tabId),
    'discarded',
  );
}

async function closeTabs(tabIds: number[]): Promise<SwitchboardResponse> {
  return settleTabIds(tabIds, (tabId) => browser.tabs.remove(tabId), 'closed');
}

async function moveTabs(
  tabIds: number[],
  windowId: number,
): Promise<SwitchboardResponse> {
  const unique = requireTabIds(tabIds);
  const tabs = await Promise.all(
    unique.map(async (tabId) => {
      try {
        return await browser.tabs.get(tabId);
      } catch {
        return undefined;
      }
    }),
  );
  const pinned = tabs.flatMap((tab) =>
    tab?.id !== undefined && tab.pinned ? [tab.id] : [],
  );
  const unpinned = tabs.flatMap((tab) =>
    tab?.id !== undefined && !tab.pinned ? [tab.id] : [],
  );
  const missing = unique.filter(
    (tabId) => !pinned.includes(tabId) && !unpinned.includes(tabId),
  );
  const warnings = missing.map(
    (tabId) => `Tab ${tabId} is no longer available`,
  );

  if (pinned.length > 0) {
    try {
      const moved = await browser.tabs.move(pinned, { windowId, index: 0 });
      const movedIds = new Set(
        (Array.isArray(moved) ? moved : [moved]).flatMap((tab) =>
          tab.id === undefined ? [] : [tab.id],
        ),
      );
      for (const tabId of pinned) {
        if (!movedIds.has(tabId)) {
          warnings.push(`Pinned tab ${tabId} could not be moved`);
        }
      }
    } catch {
      for (const tabId of pinned) {
        warnings.push(`Pinned tab ${tabId} could not be moved`);
      }
    }
  }
  if (unpinned.length > 0) {
    try {
      const moved = await browser.tabs.move(unpinned, {
        windowId,
        index: -1,
      });
      const movedIds = new Set(
        (Array.isArray(moved) ? moved : [moved]).flatMap((tab) =>
          tab.id === undefined ? [] : [tab.id],
        ),
      );
      for (const tabId of unpinned) {
        if (!movedIds.has(tabId)) {
          warnings.push(`Tab ${tabId} could not be moved`);
        }
      }
    } catch {
      for (const tabId of unpinned) {
        warnings.push(`Tab ${tabId} could not be moved`);
      }
    }
  }

  await notifySwitchboardChanged();
  return {
    ok: true,
    affected: unique.length - warnings.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function groupTabs(
  tabIds: number[],
  title: string,
): Promise<SwitchboardResponse> {
  const unique = requireTabIds(tabIds);
  const results = await Promise.allSettled(
    unique.map((tabId) => browser.tabs.get(tabId)),
  );
  const warnings: string[] = [];
  const tabs = results.flatMap((result, index) => {
    if (result.status === 'rejected') {
      warnings.push(`Tab ${unique[index] ?? 'unknown'} is no longer available`);
      return [];
    }
    return [result.value];
  });
  const byWindow = new Map<number, typeof tabs>();
  for (const tab of tabs) {
    const windowTabs = byWindow.get(tab.windowId) ?? [];
    windowTabs.push(tab);
    byWindow.set(tab.windowId, windowTabs);
  }
  let affected = 0;
  for (const [windowId, windowTabs] of byWindow) {
    const groupedIds = windowTabs.flatMap((tab) =>
      tab.id === undefined ? [] : [tab.id],
    );
    const [firstTabId, ...remainingTabIds] = groupedIds;
    if (firstTabId === undefined) {
      continue;
    }
    try {
      const groupId = await (browser.tabs.group({
        tabIds: [firstTabId, ...remainingTabIds],
        createProperties: { windowId },
      }) as Promise<number>);
      await browser.tabGroups.update(groupId, {
        title: cleanName(title, 'Tabman group').slice(0, 64),
      });
      affected += windowTabs.length;
    } catch {
      warnings.push(`Could not group tabs in window ${windowId}`);
    }
  }
  await notifySwitchboardChanged();
  return {
    ok: true,
    affected,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function parkTabs(
  tabIds: number[],
  name: string,
): Promise<SwitchboardResponse> {
  const ids = requireTabIds(tabIds);
  const results = await Promise.allSettled(
    ids.map((tabId) => browser.tabs.get(tabId)),
  );
  const now = new Date().toISOString();
  const collectionId = crypto.randomUUID();
  const warnings: string[] = [];
  const records: TabRecord[] = [];
  const parkedBrowserTabIds: number[] = [];

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      warnings.push(`Tab ${ids[index] ?? 'unknown'} is no longer available`);
      continue;
    }
    const source = result.value;
    if (source.incognito) {
      warnings.push(
        `${source.title || 'A private tab'} cannot be parked from an incognito window`,
      );
      continue;
    }
    const url = parkableAddress(source.url);
    if (!url || source.id === undefined) {
      warnings.push(
        `${source.title || 'A tab'} cannot be parked (http/https only)`,
      );
      continue;
    }
    try {
      const parsedUrl = new URL(url);
      const favIconUrl = supportedAddress(source.favIconUrl);
      const tab = tabSchema.parse({
        id: crypto.randomUUID(),
        title: (source.title ?? url).slice(0, 2048),
        url,
        hostname: parsedUrl.hostname,
        ...(favIconUrl ? { favIconUrl } : {}),
        pinned: source.pinned,
        position: records.length,
        createdAt: now,
        lastAccessedAt: null,
        tagIds: [],
      });
      records.push({
        ...tab,
        collectionId,
        normalizedHostname: normalizeHostname(tab.hostname),
      });
      parkedBrowserTabIds.push(source.id);
    } catch {
      warnings.push(`${source.title || url} could not be parked`);
    }
  }

  if (records.length === 0) {
    throw new Error('None of the selected tabs can be parked');
  }

  const collection = collectionSchema.parse({
    id: collectionId,
    name: cleanName(name, `Parked ${new Date().toLocaleDateString()}`),
    description: null,
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
  const database = new TabmanDatabase();
  try {
    await database.transaction(
      'rw',
      [database.collections, database.tabs, database.settings],
      async () => {
        const existingSettings = await database.settings.get('settings');
        const parkingCollectionIds = [
          ...(existingSettings?.parkingCollectionIds ?? []),
          collectionId,
        ];
        await database.collections.add(collectionRecord);
        await database.tabs.bulkAdd(records);
        if (existingSettings) {
          await database.settings.put({
            ...existingSettings,
            parkingCollectionIds,
          });
        } else {
          await database.settings.add({
            id: 'settings',
            lastImportedAt: now,
            theme: 'system',
            defaultView: 'list',
            includeFullUrlInAi: false,
            aiProvider: null,
            parkingCollectionIds,
          });
        }
      },
    );

    const closeResults = await Promise.allSettled(
      parkedBrowserTabIds.map((tabId) => browser.tabs.remove(tabId)),
    );
    for (const [index, result] of closeResults.entries()) {
      if (result.status === 'rejected') {
        warnings.push(
          `Parked tab ${parkedBrowserTabIds[index] ?? 'unknown'} could not be closed`,
        );
      }
    }
  } finally {
    try {
      await database.transaction('rw', database.settings, async () => {
        const existingSettings = await database.settings.get('settings');
        if (!existingSettings?.parkingCollectionIds) {
          return;
        }
        await database.settings.put({
          ...existingSettings,
          parkingCollectionIds: existingSettings.parkingCollectionIds.filter(
            (id) => id !== collectionId,
          ),
        });
      });
    } finally {
      database.close();
    }
  }

  await notifyLibraryChanged();
  await notifySwitchboardChanged();
  return {
    ok: true,
    affected: records.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function clearStaleParkingLocks(): Promise<void> {
  const database = new TabmanDatabase();
  try {
    await database.transaction('rw', database.settings, async () => {
      const existingSettings = await database.settings.get('settings');
      if (!existingSettings?.parkingCollectionIds?.length) {
        return;
      }
      await database.settings.put({
        ...existingSettings,
        parkingCollectionIds: [],
      });
    });
  } finally {
    database.close();
  }
}

export async function handleSwitchboardRequest(
  message: unknown,
): Promise<SwitchboardResponse> {
  try {
    const request = parseSwitchboardRequest(message);
    switch (request.type) {
      case 'switchboard/get':
        return await getSnapshot();
      case 'switchboard/activate': {
        const tab = await browser.tabs.get(request.tabId);
        if (tab.id === undefined) {
          throw new Error('Tab is no longer available');
        }
        await browser.tabs.update(tab.id, { active: true });
        await browser.windows.update(tab.windowId, { focused: true });
        return { ok: true };
      }
      case 'switchboard/action':
        return request.action === 'discard'
          ? await discardTabs(request.tabIds)
          : await closeTabs(request.tabIds);
      case 'switchboard/move':
        return await moveTabs(request.tabIds, request.windowId);
      case 'switchboard/group':
        return await groupTabs(request.tabIds, request.title);
      case 'switchboard/park':
        return await parkTabs(request.tabIds, request.name);
      case 'dashboard/open':
        await browser.tabs.create({
          url: browser.runtime.getURL('/dashboard.html'),
        });
        return { ok: true };
    }
  } catch (error) {
    return errorResponse(error);
  }
}
