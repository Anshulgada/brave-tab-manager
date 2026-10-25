import { describe, expect, it } from 'vitest';
import { buildHash, parseHash } from '../entrypoints/dashboard/router';

describe('dashboard hash router', () => {
  it('parses empty, root, and home hash as home section', () => {
    expect(parseHash('')).toEqual({ section: 'home' });
    expect(parseHash('#')).toEqual({ section: 'home' });
    expect(parseHash('#/')).toEqual({ section: 'home' });
    expect(parseHash('#/home')).toEqual({ section: 'home' });
    expect(parseHash('#home')).toEqual({ section: 'home' });
  });

  it('parses direct panel routes correctly', () => {
    expect(parseHash('#/windows')).toEqual({ section: 'windows' });
    expect(parseHash('#/organize')).toEqual({ section: 'organize' });
    expect(parseHash('#/providers')).toEqual({ section: 'providers' });
    expect(parseHash('#/rules')).toEqual({ section: 'rules' });
    expect(parseHash('#/trash')).toEqual({ section: 'trash' });
    expect(parseHash('#/settings')).toEqual({ section: 'settings' });
    expect(parseHash('#/preferences')).toEqual({ section: 'settings' });
  });

  it('parses collection routes with collectionId', () => {
    expect(parseHash('#/collection/col-abc-123')).toEqual({
      section: 'collection',
      collectionId: 'col-abc-123',
    });
    expect(parseHash('#collection/42')).toEqual({
      section: 'collection',
      collectionId: '42',
    });
  });

  it('falls back to home for unknown routes', () => {
    expect(parseHash('#/unknown-route')).toEqual({ section: 'home' });
    expect(parseHash('#/collection/')).toEqual({ section: 'home' });
  });

  it('builds hashes properly for all sections', () => {
    expect(buildHash({ section: 'home' })).toBe('#/home');
    expect(buildHash({ section: 'windows' })).toBe('#/windows');
    expect(buildHash({ section: 'organize' })).toBe('#/organize');
    expect(buildHash({ section: 'providers' })).toBe('#/providers');
    expect(buildHash({ section: 'rules' })).toBe('#/rules');
    expect(buildHash({ section: 'trash' })).toBe('#/trash');
    expect(buildHash({ section: 'settings' })).toBe('#/settings');
    expect(
      buildHash({ section: 'collection', collectionId: 'col-abc-123' }),
    ).toBe('#/collection/col-abc-123');
  });
});
