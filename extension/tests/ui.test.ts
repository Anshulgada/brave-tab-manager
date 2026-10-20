import { describe, expect, it } from 'vitest';

import {
  groupBy,
  hostInitial,
  hostLabel,
  pluralize,
  relativeTime,
  tabLabel,
} from '../src/ui/format';

const NOW = Date.parse('2026-10-20T12:00:00.000Z');

describe('relativeTime', () => {
  it('describes recent moments', () => {
    expect(relativeTime('2026-10-20T11:59:30.000Z', NOW)).toBe('just now');
    expect(relativeTime('2026-10-20T11:55:00.000Z', NOW)).toBe('5 min ago');
    expect(relativeTime('2026-10-20T10:00:00.000Z', NOW)).toBe('2 hours ago');
  });

  it('describes days and older dates', () => {
    expect(relativeTime('2026-10-19T12:00:00.000Z', NOW)).toBe('yesterday');
    expect(relativeTime('2026-10-17T12:00:00.000Z', NOW)).toBe('3 days ago');
    expect(relativeTime('2026-01-04T12:00:00.000Z', NOW)).toMatch(/Jan/);
  });

  it('ignores missing or broken timestamps', () => {
    expect(relativeTime(undefined, NOW)).toBe('');
    expect(relativeTime('not a date', NOW)).toBe('');
  });
});

describe('pluralize', () => {
  it('uses the singular for one item', () => {
    expect(pluralize(1, 'tab')).toBe('tab');
    expect(pluralize(0, 'tab')).toBe('tabs');
    expect(pluralize(4, 'tab')).toBe('tabs');
  });

  it('accepts an explicit plural', () => {
    expect(pluralize(2, 'entry', 'entries')).toBe('entries');
    expect(pluralize(1, 'entry', 'entries')).toBe('entry');
  });
});

describe('tab labels', () => {
  it('falls back through title, hostname, and url', () => {
    expect(tabLabel('Docs', 'example.com', 'https://example.com')).toBe('Docs');
    expect(tabLabel('', 'example.com', 'https://example.com')).toBe(
      'example.com',
    );
    expect(tabLabel('', '', 'https://example.com')).toBe('https://example.com');
  });

  it('builds a readable host label', () => {
    expect(hostLabel('example.com', 'https://example.com/x')).toBe(
      'example.com',
    );
    expect(hostLabel('', 'https://example.com/x')).toBe('example.com');
  });

  it('builds a fallback initial', () => {
    expect(hostInitial('example.com', 'https://example.com')).toBe('E');
    expect(hostInitial('', 'https://example.com')).toBe('E');
    expect(hostInitial('', '')).toBe('#');
  });
});

describe('groupBy', () => {
  it('keeps the original order inside each group', () => {
    const grouped = groupBy(
      [
        { id: 'a', kind: 'x' },
        { id: 'b', kind: 'y' },
        { id: 'c', kind: 'x' },
      ],
      (item) => item.kind,
    );

    expect([...grouped.keys()]).toEqual(['x', 'y']);
    expect(grouped.get('x')?.map((item) => item.id)).toEqual(['a', 'c']);
  });
});
