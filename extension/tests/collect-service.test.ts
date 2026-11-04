import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { collectOpenTabs } from '../src/collect-service';
import { TabmanDatabase } from '../src/database';

function installBrowserMock(tabs: unknown[]) {
  const mock = {
    runtime: {
      sendMessage: async () => undefined,
      getURL: (path: string) => `chrome-extension://tabman${path}`,
      onMessage: {
        addListener: () => undefined,
        removeListener: () => undefined,
        hasListener: () => false,
      },
    },
    tabs: {
      query: async () => tabs,
      create: async () => ({ id: 1 }),
    },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => undefined,
        remove: async () => undefined,
      },
    },
  };
  (globalThis as unknown as { browser: typeof mock }).browser = mock;
  return mock;
}

const OPEN_TAB = {
  id: 1,
  windowId: 1,
  index: 0,
  title: 'WXT',
  url: 'https://wxt.dev/',
  favIconUrl: 'https://wxt.dev/favicon.ico',
  pinned: false,
  active: true,
  audible: false,
  discarded: false,
  groupId: -1,
  incognito: false,
};

describe('collecting the open tabs', () => {
  it('refuses when there is nothing to collect', async () => {
    installBrowserMock([]);

    await expect(collectOpenTabs('Test')).rejects.toThrow(
      'There are no open tabs to collect',
    );
  });

  it('skips the tabs it cannot store', async () => {
    installBrowserMock([
      OPEN_TAB,
      { ...OPEN_TAB, id: 2, url: 'javascript:void(0)' },
      { ...OPEN_TAB, id: 3, incognito: true },
    ]);

    const result = await collectOpenTabs('Test');

    expect(result.affected).toBe(1);
  });

  it('preserves full URLs with query parameters and # fragments as is in the database', async () => {
    const rawUrlWithParams =
      'https://example.com/search?q=test&lang=en#section-4';
    installBrowserMock([{ ...OPEN_TAB, id: 10, url: rawUrlWithParams }]);

    const result = await collectOpenTabs('Test As Is');
    expect(result.affected).toBe(1);

    const db = new TabmanDatabase();
    const storedTab = await db.tabs
      .where('collectionId')
      .equals(result.collectionId)
      .first();
    expect(storedTab?.url).toBe(
      'https://example.com/search?lang=en&q=test#section-4',
    );
  });

  it('deduplicates identical open tabs using deduplicateUrls while saving URLs as is', async () => {
    const rawUrl = 'https://example.com/repo?tab=readme#install';
    installBrowserMock([
      { ...OPEN_TAB, id: 11, url: rawUrl, title: 'Repo Readme 1' },
      { ...OPEN_TAB, id: 12, url: rawUrl, title: 'Repo Readme 2' },
    ]);

    const result = await collectOpenTabs('Test Dedup Open');
    expect(result.affected).toBe(1);

    const db = new TabmanDatabase();
    const storedTabs = await db.tabs
      .where('collectionId')
      .equals(result.collectionId)
      .toArray();
    expect(storedTabs.length).toBe(1);
    expect(storedTabs[0]?.url).toBe(rawUrl);
  });

  it('drops tracking parameters (utm, fbclid) while preserving legitimate query params and # fragments', async () => {
    const trackingUrl =
      'https://example.com/search?utm_source=twitter&q=rust&utm_campaign=ad#heading';
    installBrowserMock([{ ...OPEN_TAB, id: 20, url: trackingUrl }]);

    const result = await collectOpenTabs('Test Tracking Dropped');
    expect(result.affected).toBe(1);

    const db = new TabmanDatabase();
    const storedTab = await db.tabs
      .where('collectionId')
      .equals(result.collectionId)
      .first();
    expect(storedTab?.url).toBe('https://example.com/search?q=rust#heading');
    expect(storedTab?.url).not.toContain('utm_source');
    expect(storedTab?.url).not.toContain('utm_campaign');
  });
});
