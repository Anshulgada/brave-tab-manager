import { describe, expect, it } from 'vitest';

import {
  type BrowserWindowSnapshot,
  buildSwitchboardSnapshot,
  duplicateKey,
  filterSwitchboard,
} from '../src/switchboard';

const windows: BrowserWindowSnapshot[] = [
  {
    id: 1,
    focused: true,
    incognito: false,
    type: 'normal',
    tabs: [
      {
        id: 10,
        windowId: 1,
        index: 0,
        title: 'WXT extension guide',
        url: 'https://wxt.dev/guide/#entrypoints',
        pinned: false,
        active: true,
        discarded: false,
        groupId: -1,
      },
      {
        id: 11,
        windowId: 1,
        index: 1,
        title: 'Incomplete tab',
        pinned: false,
        active: false,
        discarded: false,
        groupId: -1,
      },
    ],
  },
  {
    id: 2,
    focused: false,
    incognito: false,
    type: 'normal',
    tabs: [
      {
        id: 20,
        windowId: 2,
        index: 0,
        title: 'Same guide',
        url: 'https://wxt.dev/guide/',
        pinned: true,
        active: true,
        audible: true,
        discarded: false,
        groupId: 7,
      },
      {
        id: 21,
        windowId: 2,
        index: 1,
        title: 'Tabman repository',
        url: 'https://github.com/Anshulgada/brave-tab-manager',
        pinned: false,
        active: false,
        discarded: true,
        groupId: -1,
      },
    ],
  },
];

describe('switchboard snapshot', () => {
  it('normalizes windows and marks URL duplicates across windows', () => {
    const snapshot = buildSwitchboardSnapshot(
      windows,
      '2026-07-19T12:00:00.000Z',
    );

    expect(snapshot).toMatchObject({
      capturedAt: '2026-07-19T12:00:00.000Z',
      tabCount: 4,
      duplicateCount: 2,
    });
    expect(snapshot.windows[0]?.tabs[0]).toMatchObject({
      hostname: 'wxt.dev',
      duplicateCount: 2,
    });
    expect(snapshot.windows[0]?.tabs[1]).toMatchObject({
      title: 'Incomplete tab',
      url: '',
      duplicateCount: 1,
    });
    expect(snapshot.windows[1]?.tabs[0]).toMatchObject({
      audible: true,
      duplicateCount: 2,
    });
  });

  it('searches title, hostname, and URL while preserving source counts', () => {
    const snapshot = buildSwitchboardSnapshot(windows);

    const titleMatch = filterSwitchboard(snapshot, 'tabman');
    const hostMatches = filterSwitchboard(snapshot, 'WXT.DEV');

    expect(titleMatch.tabCount).toBe(1);
    expect(titleMatch.windows[0]?.tabs[0]?.id).toBe(21);
    expect(hostMatches.tabCount).toBe(2);
    expect(hostMatches.windows).toHaveLength(2);
  });

  it('ignores URL fragments when identifying duplicate tabs', () => {
    expect(duplicateKey('https://example.com/docs#one')).toBe(
      duplicateKey('https://example.com/docs#two'),
    );
  });

  it('normalizes host case, www, and trailing slashes for duplicates', () => {
    expect(duplicateKey('https://WWW.Example.com/docs/')).toBe(
      duplicateKey('https://example.com/docs'),
    );
  });
});
