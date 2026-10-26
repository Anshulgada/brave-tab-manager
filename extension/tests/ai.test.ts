import { describe, expect, it } from 'vitest';

import {
  buildPrompt,
  deterministicSuggestions,
  endpointFor,
  extractJson,
  type OrganizeTab,
  originPattern,
  ProviderError,
  type ProviderProfile,
  requestSuggestions,
  validateBatch,
} from '../src/ai';

const TABS: OrganizeTab[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'WXT',
    hostname: 'wxt.dev',
    url: 'https://wxt.dev/',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Extensions',
    hostname: 'developer.chrome.com',
    url: 'https://developer.chrome.com/docs/extensions/',
  },
];

const PROFILE: ProviderProfile = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Gateway',
  baseUrl: 'https://gateway.example/v1',
  model: 'gpt-6-luna',
  apiFormat: 'responses',
};

describe('provider endpoints', () => {
  it('keeps a versioned base URL as it is', () => {
    expect(endpointFor(PROFILE)).toBe('https://gateway.example/v1/responses');
  });

  it('adds the version path when the base URL has none', () => {
    expect(
      endpointFor({ ...PROFILE, baseUrl: 'https://gateway.example' }),
    ).toBe('https://gateway.example/v1/responses');
  });

  it('uses the chat completions path for the compatible format', () => {
    expect(endpointFor({ ...PROFILE, apiFormat: 'openai' })).toBe(
      'https://gateway.example/v1/chat/completions',
    );
  });

  it('uses the messages path for the Anthropic format', () => {
    expect(endpointFor({ ...PROFILE, apiFormat: 'anthropic' })).toBe(
      'https://gateway.example/v1/messages',
    );
  });
});

describe('host permissions', () => {
  it('allows HTTPS providers', () => {
    expect(originPattern('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/*',
    );
  });

  it('allows a local server over HTTP', () => {
    expect(originPattern('http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1/*',
    );
  });

  it('refuses a remote provider over plain HTTP', () => {
    expect(() => originPattern('http://api.example.com/v1')).toThrow(
      ProviderError,
    );
  });

  it('refuses a base URL that is not a URL', () => {
    expect(() => originPattern('not a url')).toThrow(ProviderError);
  });
});

describe('the prompt', () => {
  it('sends the title and the hostname', () => {
    const prompt = buildPrompt(TABS, false);

    expect(prompt).toContain('wxt.dev');
    expect(prompt).not.toContain('https://wxt.dev/');
  });

  it('adds the full URL when it is allowed', () => {
    const prompt = buildPrompt(TABS, true);

    expect(prompt).toContain('https://wxt.dev/');
  });
});

describe('reading a model answer', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"items": []}')).toEqual({ items: [] });
  });

  it('parses fenced JSON', () => {
    expect(extractJson('```json\n{"items": [1]}\n```')).toEqual({ items: [1] });
  });

  it('finds JSON inside prose', () => {
    expect(extractJson('Sure! {"items": [2]} done')).toEqual({ items: [2] });
  });

  it('refuses an answer without JSON', () => {
    expect(() => extractJson('no json here')).toThrow(ProviderError);
  });
});

describe('validating a batch', () => {
  it('accepts one suggestion per tab', () => {
    const items = validateBatch(
      {
        items: TABS.map((tab) => ({
          tabId: tab.id,
          collectionName: 'Tools',
          tags: ['dev'],
        })),
      },
      TABS,
    );

    expect(items).toHaveLength(2);
  });

  it('refuses a missing tab', () => {
    expect(() =>
      validateBatch(
        { items: [{ tabId: TABS[0]?.id, collectionName: 'Tools', tags: [] }] },
        TABS,
      ),
    ).toThrow(ProviderError);
  });

  it('refuses a repeated tab', () => {
    expect(() =>
      validateBatch(
        {
          items: TABS.map(() => ({
            tabId: TABS[0]?.id,
            collectionName: 'Tools',
            tags: [],
          })),
        },
        TABS,
      ),
    ).toThrow(ProviderError);
  });

  it('refuses a suggestion for an unknown tab', () => {
    expect(() =>
      validateBatch(
        {
          items: [
            ...TABS.map((tab) => ({
              tabId: tab.id,
              collectionName: 'Tools',
              tags: [],
            })),
            {
              tabId: '44444444-4444-4444-8444-444444444444',
              collectionName: 'Tools',
              tags: [],
            },
          ],
        },
        TABS,
      ),
    ).toThrow(ProviderError);
  });
});

describe('the local grouping rules', () => {
  it('groups by the hostname', () => {
    const suggestions = deterministicSuggestions(TABS);

    expect(suggestions[0]?.collectionName).toBe('wxt');
    expect(suggestions[1]?.collectionName).toBe('chrome');
  });

  it('never returns an empty collection name', () => {
    const suggestions = deterministicSuggestions([
      { id: TABS[0]?.id ?? '', title: 'A', hostname: '' },
    ]);

    expect(suggestions[0]?.collectionName.length).toBeGreaterThan(0);
  });
});

describe('asking a provider', () => {
  it('fails when the provider answers with an error', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('nope', { status: 500 })) as typeof fetch;
    try {
      await expect(
        requestSuggestions(PROFILE, 'key', TABS, false),
      ).rejects.toThrow(ProviderError);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('reads the answer from the output items', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    items: TABS.map((tab) => ({
                      tabId: tab.id,
                      collectionName: 'Tools',
                      tags: [],
                    })),
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const items = await requestSuggestions(PROFILE, 'key', TABS, false);
      expect(items).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
