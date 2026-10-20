// Browser API stub for previewing the Tabman extension pages in a normal browser.

(() => {
  const listeners = new Set();
  const noop = () => undefined;

  const tab = (id, windowId, index, title, url, hostname, extra) => ({
    id,
    windowId,
    index,
    title,
    url,
    hostname,
    favIconUrl: null,
    pinned: false,
    active: index === 0,
    audible: false,
    discarded: false,
    groupId: -1,
    duplicateCount: 1,
    ...extra,
  });

  const snapshot = {
    capturedAt: new Date().toISOString(),
    tabCount: 6,
    duplicateCount: 2,
    windows: [
      {
        id: 1,
        focused: true,
        incognito: false,
        type: 'normal',
        tabs: [
          tab(
            11,
            1,
            0,
            'WXT - Framework for browser extensions',
            'https://wxt.dev/',
            'wxt.dev',
            { duplicateCount: 2 },
          ),
          tab(
            12,
            1,
            1,
            'Chrome Extensions documentation',
            'https://developer.chrome.com/docs/extensions/',
            'developer.chrome.com',
          ),
          tab(
            13,
            1,
            2,
            'MDN Web Extensions reference',
            'https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions',
            'developer.mozilla.org',
            { duplicateCount: 2, discarded: true },
          ),
          tab(
            14,
            1,
            3,
            'A very long tab title that should truncate instead of pushing the row',
            'https://example.com/a/very/long/path/that/keeps/going',
            'example.com',
            { audible: true },
          ),
        ],
      },
      {
        id: 7,
        focused: false,
        incognito: false,
        type: 'normal',
        tabs: [
          tab(
            21,
            7,
            0,
            'Radix Colors',
            'https://www.radix-ui.com/colors',
            'www.radix-ui.com',
          ),
          tab(
            22,
            7,
            1,
            'Tailwind CSS theme variables',
            'https://tailwindcss.com/docs/theme',
            'tailwindcss.com',
            { pinned: true },
          ),
        ],
      },
    ],
  };

  globalThis.browser = {
    runtime: {
      id: 'tabman-preview',
      getURL: (path) => new URL(path, location.origin).toString(),
      sendMessage: async (message) => {
        if (message && message.type === 'switchboard/get') {
          return { ok: true, snapshot };
        }
        return { ok: true };
      },
      onMessage: {
        addListener: (listener) => listeners.add(listener),
        removeListener: (listener) => listeners.delete(listener),
        hasListener: (listener) => listeners.has(listener),
      },
      onInstalled: { addListener: noop },
    },
    tabs: {
      create: async (details) => ({ id: 1, ...details }),
      get: async () => undefined,
      query: async () => [],
      update: async () => undefined,
    },
    windows: { getAll: async () => [] },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => undefined,
        remove: async () => undefined,
      },
    },
  };
  globalThis.chrome = globalThis.browser;
})();
