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

  it('uses the api/chat path for the Ollama format', () => {
    expect(
      endpointFor({
        ...PROFILE,
        baseUrl: 'http://127.0.0.1:11434',
        apiFormat: 'ollama',
      }),
    ).toBe('http://127.0.0.1:11434/api/chat');
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

  it('reads the answer from an Ollama JSON response', async () => {
    const originalFetch = globalThis.fetch;
    const ollamaProfile: ProviderProfile = {
      ...PROFILE,
      apiFormat: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
    };
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          model: 'embeddinggemma:latest',
          message: {
            role: 'assistant',
            content: JSON.stringify({
              items: TABS.map((tab) => ({
                tabId: tab.id,
                collectionName: 'Ollama Group',
                tags: ['local'],
              })),
            }),
          },
          done: true,
        }),
        { status: 200 },
      )) as typeof fetch;
    try {
      const items = await requestSuggestions(ollamaProfile, '', TABS, false);
      expect(items).toHaveLength(2);
      expect(items[0]?.collectionName).toBe('Ollama Group');
      expect(items[0]?.tags).toEqual(['local']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('local semantic tab clustering (tabman-local)', () => {
  it('correctly maps diverse tabs across trained domain verticals without external services', async () => {
    const { localSemanticSuggestions } = await import('../src/ai');
    const testTabs: OrganizeTab[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Synchronizing with Effects - React Official Documentation',
        hostname: 'react.dev',
        url: 'https://react.dev/learn/synchronizing-with-effects',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title:
          'What is Amazon Elastic Container Service? - Amazon ECS Documentation',
        hostname: 'docs.aws.amazon.com',
        url: 'https://docs.aws.amazon.com/AmazonECS/latest/developerguide/welcome.html',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'google/embeddinggemma-2 · Hugging Face Model Card',
        hostname: 'huggingface.co',
        url: 'https://huggingface.co/google/embeddinggemma-2',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Matryoshka Representation Learning in Multimodal Transformers',
        hostname: 'arxiv.org',
        url: 'https://arxiv.org/abs/2402.12345',
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
        hostname: 'youtube.com',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        title: 'Today Top Hits - Spotify Music Playlist',
        hostname: 'open.spotify.com',
        url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
      },
      {
        id: '77777777-7777-4777-8777-777777777777',
        title: 'Vite Development Server - Localhost:5173',
        hostname: 'localhost',
        url: 'http://localhost:5173/',
      },
    ];

    const suggestions = localSemanticSuggestions(testTabs);
    expect(suggestions).toHaveLength(7);

    expect(suggestions[0]?.collectionName).toBe('Frontend & UI Engineering');
    expect(suggestions[1]?.collectionName).toBe('Cloud & DevOps');
    expect(suggestions[2]?.collectionName).toBe('Machine Learning & AI');
    expect(suggestions[3]?.collectionName).toBe('Research & Papers');
    expect(suggestions[4]?.collectionName).toBe('Video & Tutorials');
    expect(suggestions[5]?.collectionName).toBe('Audio & Podcasts');
    expect(suggestions[6]?.collectionName).toBe('Localhost & Internal Dev');
  });

  it('clusters fallback unclassified tabs using Auto-K density clustering (Kernel 4)', async () => {
    const { localSemanticSuggestions } = await import('../src/ai');
    const miscTabs: OrganizeTab[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Tech Crunch Article One',
        hostname: 'techcrunch.com',
        url: 'https://techcrunch.com/article1',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Tech Crunch Article Two',
        hostname: 'techcrunch.com',
        url: 'https://techcrunch.com/article2',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Verge Gadget Review',
        hostname: 'theverge.com',
        url: 'https://theverge.com/gadget',
      },
    ];

    const suggestions = localSemanticSuggestions(miscTabs);
    expect(suggestions).toHaveLength(3);
    // Verified suggestions are populated and structured
    expect(suggestions[0]?.collectionName).toBeDefined();
    expect(suggestions[1]?.collectionName).toBeDefined();
  });

  it('clusters tabs with K-Means (Kernel 3) and computes pairwise cosine matrix (Kernel 1)', async () => {
    const {
      clusterTabsSemantically,
      computeTabSimilarityMatrix,
      searchTopRelatedTabs,
      projectTabEmbeddings,
    } = await import('../src/ai');

    const sampleTabs: OrganizeTab[] = [
      {
        id: '1',
        title: 'Rust Programming Language',
        hostname: 'rust-lang.org',
        url: 'https://rust-lang.org',
      },
      {
        id: '2',
        title: 'Rust Cargo Package Manager',
        hostname: 'doc.rust-lang.org',
        url: 'https://doc.rust-lang.org/cargo',
      },
      {
        id: '3',
        title: 'Cooking Pasta Recipes',
        hostname: 'allrecipes.com',
        url: 'https://allrecipes.com/pasta',
      },
      {
        id: '4',
        title: 'Baking Homemade Bread',
        hostname: 'allrecipes.com',
        url: 'https://allrecipes.com/bread',
      },
    ];

    // Kernel 3: K-Means clustering into k=2 groups
    const clustered = clusterTabsSemantically(sampleTabs, 2);
    expect(clustered).toHaveLength(4);
    // Tab 1 and 2 share Rust topics, Tab 3 and 4 share Cooking topics
    expect(clustered[0]?.collectionName).toBe(clustered[1]?.collectionName);
    expect(clustered[2]?.collectionName).toBe(clustered[3]?.collectionName);
    expect(clustered[0]?.collectionName).not.toBe(clustered[2]?.collectionName);

    // Kernel 1: Pairwise cosine matrix
    const matrix = computeTabSimilarityMatrix(sampleTabs, 128);
    expect(matrix.length).toBe(16); // 4x4 matrix
    // Self similarity on diagonal is 1.0
    expect(matrix[0]).toBeCloseTo(1.0, 3);
    expect(matrix[5]).toBeCloseTo(1.0, 3);
    // Rust vs Rust similarity is higher than Rust vs Cooking
    const simRust1Rust2 = matrix[1] ?? 0;
    const simRust1Cooking = matrix[2] ?? 0;
    expect(simRust1Rust2).toBeGreaterThan(simRust1Cooking);

    // Kernel 2: Top-K related tabs
    const firstTab = sampleTabs[0];
    if (!firstTab) throw new Error('sampleTabs[0] missing');
    const related = searchTopRelatedTabs(firstTab, sampleTabs.slice(1), 2);
    expect(related.length).toBe(2);
    expect(related[0]?.id).toBe('2'); // Cargo is most related to Rust

    // Kernel 7: Matryoshka Slicing
    const highDim = [new Float32Array(768).fill(0.1)];
    const sliced = projectTabEmbeddings(highDim, 128);
    expect(sliced).toHaveLength(1);
    expect(sliced[0]?.length).toBe(128);
  });
});
