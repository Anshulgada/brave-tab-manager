import { TabmanDatabase, type TabRecord } from './database';
import type { SwitchboardRequest, SwitchboardResponse } from './messages';
import { errorResponse } from './messages';
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

async function discardTabs(tabIds: number[]): Promise<SwitchboardResponse> {
  const results = await Promise.allSettled(
    requireTabIds(tabIds).map((tabId) => browser.tabs.discard(tabId)),
  );
  const warnings = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [`Tab ${tabIds[index] ?? 'unknown'} could not be discarded`]
      : [],
  );
  await notifySwitchboardChanged();
  return {
    ok: true,
    affected: results.length - warnings.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

async function moveTabs(
  tabIds: number[],
  windowId: number,
): Promise<SwitchboardResponse> {
  const unique = requireTabIds(tabIds);
  await browser.tabs.move(unique, { windowId, index: -1 });
  await notifySwitchboardChanged();
  return { ok: true, affected: unique.length };
}

async function groupTabs(
  tabIds: number[],
  title: string,
): Promise<SwitchboardResponse> {
  const tabs = await Promise.all(
    requireTabIds(tabIds).map((tabId) => browser.tabs.get(tabId)),
  );
  const byWindow = new Map<number, typeof tabs>();
  for (const tab of tabs) {
    const windowTabs = byWindow.get(tab.windowId) ?? [];
    windowTabs.push(tab);
    byWindow.set(tab.windowId, windowTabs);
  }
  let affected = 0;
  for (const [windowId, windowTabs] of byWindow) {
    const tabIds = windowTabs.flatMap((tab) =>
      tab.id === undefined ? [] : [tab.id],
    );
    const [firstTabId, ...remainingTabIds] = tabIds;
    if (firstTabId === undefined) {
      continue;
    }
    const groupId = await (browser.tabs.group({
      tabIds: [firstTabId, ...remainingTabIds],
      createProperties: { windowId },
    }) as Promise<number>);
    await browser.tabGroups.update(groupId, {
      title: cleanName(title, 'Tabman group').slice(0, 64),
    });
    affected += windowTabs.length;
  }
  await notifySwitchboardChanged();
  return { ok: true, affected };
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

  for (const [index, result] of results.entries()) {
    if (result.status === 'rejected') {
      warnings.push(`Tab ${ids[index] ?? 'unknown'} is no longer available`);
      continue;
    }
    const source = result.value;
    const url = supportedAddress(source.url);
    if (!url || source.id === undefined) {
      warnings.push(`${source.title || 'A tab'} uses an unsupported URL`);
      continue;
    }
    const parsedUrl = new URL(url);
    const favIconUrl = supportedAddress(source.favIconUrl);
    const tab = tabSchema.parse({
      id: crypto.randomUUID(),
      title: source.title ?? url,
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
      normalizedHostname: tab.hostname.toLocaleLowerCase(),
    });
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
        await database.collections.add(collectionRecord);
        await database.tabs.bulkAdd(records);
        if (!(await database.settings.get('settings'))) {
          await database.settings.add({
            id: 'settings',
            lastImportedAt: now,
            theme: 'system',
            defaultView: 'list',
            includeFullUrlInAi: false,
            aiProvider: null,
          });
        }
      },
    );
  } finally {
    database.close();
  }

  const parkedBrowserTabIds = results.flatMap((result) =>
    result.status === 'fulfilled' &&
    result.value.id !== undefined &&
    supportedAddress(result.value.url)
      ? [result.value.id]
      : [],
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
  await notifyLibraryChanged();
  await notifySwitchboardChanged();
  return {
    ok: true,
    affected: records.length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export async function handleSwitchboardRequest(
  message: SwitchboardRequest,
): Promise<SwitchboardResponse> {
  try {
    switch (message.type) {
      case 'switchboard/get':
        return await getSnapshot();
      case 'switchboard/activate':
        await browser.tabs.update(message.tabId, { active: true });
        await browser.windows.update(message.windowId, { focused: true });
        return { ok: true };
      case 'switchboard/action': {
        const tabIds = requireTabIds(message.tabIds);
        if (message.action === 'discard') {
          return await discardTabs(tabIds);
        }
        await browser.tabs.remove(tabIds);
        await notifySwitchboardChanged();
        return { ok: true, affected: tabIds.length };
      }
      case 'switchboard/move':
        return await moveTabs(message.tabIds, message.windowId);
      case 'switchboard/group':
        return await groupTabs(message.tabIds, message.title);
      case 'switchboard/park':
        return await parkTabs(message.tabIds, message.name);
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
