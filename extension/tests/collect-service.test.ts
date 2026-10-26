import 'fake-indexeddb/auto';

import { describe, expect, it } from 'vitest';

import { collectOpenTabs } from '../src/collect-service';

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
});
