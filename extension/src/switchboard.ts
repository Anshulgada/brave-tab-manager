export interface BrowserTabSnapshot {
  id?: number;
  windowId?: number;
  index: number;
  title?: string;
  url?: string;
  favIconUrl?: string;
  pinned: boolean;
  active: boolean;
  audible?: boolean;
  discarded: boolean;
  groupId: number;
}

export interface BrowserWindowSnapshot {
  id?: number;
  focused: boolean;
  incognito: boolean;
  type?: string;
  tabs?: BrowserTabSnapshot[];
}

export interface SwitchboardTab {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  hostname: string;
  favIconUrl?: string;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  discarded: boolean;
  groupId: number;
  duplicateCount: number;
}

export interface SwitchboardWindow {
  id: number;
  focused: boolean;
  incognito: boolean;
  type: string;
  tabs: SwitchboardTab[];
}

export interface SwitchboardSnapshot {
  capturedAt: string;
  windows: SwitchboardWindow[];
  tabCount: number;
  duplicateCount: number;
}

function hostnameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname || parsed.protocol.replace(':', '');
  } catch {
    return '';
  }
}

export function duplicateKey(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.replace(/^www\./i, '').toLowerCase();
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.href;
  } catch {
    return trimmed;
  }
}

export function buildSwitchboardSnapshot(
  source: BrowserWindowSnapshot[],
  capturedAt = new Date().toISOString(),
): SwitchboardSnapshot {
  const validWindows = source.flatMap((window) => {
    if (window.id === undefined) {
      return [];
    }
    const tabs = (window.tabs ?? []).flatMap((tab) => {
      if (tab.id === undefined || tab.windowId === undefined) {
        return [];
      }
      const url = tab.url;
      if (url === undefined) {
        return [
          {
            id: tab.id,
            windowId: tab.windowId,
            index: tab.index,
            title: tab.title?.trim() || 'Loading…',
            url: '',
            hostname: '',
            ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
            pinned: tab.pinned,
            active: tab.active,
            audible: tab.audible === true,
            discarded: tab.discarded,
            groupId: tab.groupId,
            duplicateCount: 1,
          } satisfies SwitchboardTab,
        ];
      }
      return [
        {
          id: tab.id,
          windowId: tab.windowId,
          index: tab.index,
          title: tab.title?.trim() || url,
          url,
          hostname: hostnameFromUrl(url),
          ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
          pinned: tab.pinned,
          active: tab.active,
          audible: tab.audible === true,
          discarded: tab.discarded,
          groupId: tab.groupId,
          duplicateCount: 1,
        } satisfies SwitchboardTab,
      ];
    });
    return [
      {
        id: window.id,
        focused: window.focused,
        incognito: window.incognito,
        type: window.type ?? 'normal',
        tabs,
      } satisfies SwitchboardWindow,
    ];
  });

  const occurrences = new Map<string, number>();
  for (const tab of validWindows.flatMap((window) => window.tabs)) {
    const key = tab.url ? duplicateKey(tab.url) : `loading:${tab.id}`;
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }

  let duplicateCount = 0;
  const windows = validWindows.map((window) => ({
    ...window,
    tabs: window.tabs.map((tab) => {
      const key = tab.url ? duplicateKey(tab.url) : `loading:${tab.id}`;
      const count = occurrences.get(key) ?? 1;
      if (count > 1) {
        duplicateCount += 1;
      }
      return { ...tab, duplicateCount: count };
    }),
  }));

  return {
    capturedAt,
    windows,
    tabCount: windows.reduce((total, window) => total + window.tabs.length, 0),
    duplicateCount,
  };
}

export function filterSwitchboard(
  snapshot: SwitchboardSnapshot,
  query: string,
): SwitchboardSnapshot {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) {
    return snapshot;
  }
  const windows = snapshot.windows
    .map((window) => ({
      ...window,
      tabs: window.tabs.filter((tab) =>
        [tab.title, tab.url, tab.hostname].some((value) =>
          value.toLocaleLowerCase().includes(needle),
        ),
      ),
    }))
    .filter((window) => window.tabs.length > 0);
  return {
    ...snapshot,
    windows,
    tabCount: windows.reduce((total, window) => total + window.tabs.length, 0),
    duplicateCount: windows
      .flatMap((window) => window.tabs)
      .filter((tab) => tab.duplicateCount > 1).length,
  };
}
