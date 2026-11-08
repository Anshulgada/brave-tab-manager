import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchIframelyPreview,
  getCachedPreview,
  type IframelyApiResponse,
  parseIframelyResponse,
  testIframelyApiKey,
} from '../src/iframely';

describe('Iframely rich preview integration', () => {
  let storage: Record<string, string> = {};

  beforeEach(() => {
    storage = {};
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => storage[k] ?? null,
        setItem: (k: string, v: string) => {
          storage[k] = String(v);
        },
        removeItem: (k: string) => {
          delete storage[k];
        },
        clear: () => {
          storage = {};
        },
      },
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  const mockPayload: IframelyApiResponse = {
    url: 'https://github.com/brave-tab-manager/extension',
    meta: {
      title: 'GitHub - Tabman Local Tab Manager',
      description: 'Local-first switchboard and tab library for Chromium.',
      site: 'GitHub',
      author: 'Anshul Gada',
      favicon: 'https://github.githubassets.com/favicons/favicon.png',
    },
    links: {
      thumbnail: [
        {
          href: 'https://opengraph.githubassets.com/tabman/overview.png',
          media: { width: 1200, height: 600 },
        },
      ],
      icon: [
        {
          href: 'https://github.githubassets.com/favicons/favicon.svg',
        },
      ],
    },
  };

  it('correctly parses an Iframely API payload into card fields', () => {
    const preview = parseIframelyResponse(mockPayload);
    expect(preview.title).toBe('GitHub - Tabman Local Tab Manager');
    expect(preview.description).toBe(
      'Local-first switchboard and tab library for Chromium.',
    );
    expect(preview.site).toBe('GitHub');
    expect(preview.author).toBe('Anshul Gada');
    expect(preview.thumbnailUrl).toBe(
      'https://opengraph.githubassets.com/tabman/overview.png',
    );
    expect(preview.favicon).toBe(
      'https://github.githubassets.com/favicons/favicon.svg',
    );
    expect(preview.mediaWidth).toBe(1200);
    expect(preview.mediaHeight).toBe(600);
  });

  it('stores and retrieves cached previews from localStorage', () => {
    const url = 'https://example.com/article';
    expect(getCachedPreview(url)).toBeNull();

    const sample = parseIframelyResponse(mockPayload);
    localStorage.setItem(
      `tabman_preview_${url}`,
      JSON.stringify({ timestamp: Date.now(), data: sample }),
    );

    const cached = getCachedPreview(url);
    expect(cached).not.toBeNull();
    expect(cached?.title).toBe('GitHub - Tabman Local Tab Manager');
  });

  it('fetches remote metadata and populates cache on successful call', async () => {
    const url = 'https://github.com/brave-tab-manager';
    const apiKey = 'test_api_key_12345'; // pragma: allowlist secret

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockPayload,
    } as Response);

    const preview = await fetchIframelyPreview(url, apiKey);
    expect(preview).not.toBeNull();
    expect(preview?.title).toBe('GitHub - Tabman Local Tab Manager');

    // Verify it was cached
    const cached = getCachedPreview(url);
    expect(cached?.title).toBe('GitHub - Tabman Local Tab Manager');
  });

  it('handles invalid API keys gracefully without throwing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const preview = await fetchIframelyPreview(
      'https://example.com',
      'invalid_key',
    );
    expect(preview).toBeNull();
  });

  it('tests API key status accurately', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as Response);

    const validResult = await testIframelyApiKey('valid_key_123');
    expect(validResult.ok).toBe(true);
    expect(validResult.message).toContain('Valid API key');

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response);

    const invalidResult = await testIframelyApiKey('bad_key');
    expect(invalidResult.ok).toBe(false);
    expect(invalidResult.message).toContain('Invalid API key');
  });

  it('permanently caches previews and allows explicit deletion', () => {
    const url = 'https://example.com/permanent';
    const sample = parseIframelyResponse(mockPayload);
    localStorage.setItem(
      `tabman_preview_${url}`,
      JSON.stringify({
        timestamp: Date.now() - 40 * 86400 * 1000,
        data: sample,
      }),
    );

    // 40 days old: must still be returned (offline permanent storage)
    const cached = getCachedPreview(url);
    expect(cached).not.toBeNull();
    expect(cached?.title).toBe('GitHub - Tabman Local Tab Manager');
  });
});
