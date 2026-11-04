/**
 * Provider profiles and batched organization for the extension.
 *
 * The profiles mirror the CLI: a display name, a base URL, a model, and the
 * API format. Keys never leave the browser. They live in session storage by
 * default and can be forgotten at any time.
 */

import { z } from 'zod';
import {
  autoKCluster,
  clusterTabs,
  computePairwiseCosine,
  fastTokenize,
  matryoshkaSlice,
  searchTopKTabs,
} from './rust-wasm';

export const apiFormatSchema = z.enum([
  'openai',
  'responses',
  'anthropic',
  'ollama',
  'tabman-local',
]);
export type ApiFormat = z.infer<typeof apiFormatSchema>;

export const providerProfileSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  baseUrl: z.string().min(1).max(2048),
  model: z.string().min(1).max(200),
  apiFormat: apiFormatSchema,
  envVar: z.string().max(120).optional(),
});
export type ProviderProfile = z.infer<typeof providerProfileSchema>;

export const providerSettingsSchema = z.strictObject({
  providers: z.array(providerProfileSchema),
  activeProviderId: z.uuid().nullable(),
  rememberKey: z.boolean(),
});
export type ProviderSettings = z.infer<typeof providerSettingsSchema>;

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  providers: [],
  activeProviderId: null,
  rememberKey: false,
};

/** One tab as the model sees it. */
export interface OrganizeTab {
  id: string;
  title: string;
  hostname: string;
  url?: string;
}

/** One suggestion for a tab. */
export const suggestionSchema = z.strictObject({
  tabId: z.uuid(),
  collectionName: z.string().min(1).max(120),
  tags: z.array(z.string().min(1).max(64)).max(12),
});
export type Suggestion = z.infer<typeof suggestionSchema>;

export const suggestionBatchSchema = z.strictObject({
  items: z.array(suggestionSchema).min(1),
});
export type SuggestionBatch = z.infer<typeof suggestionBatchSchema>;

export class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

/** Return the origin pattern a provider needs for its host permission. */
export function originPattern(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ProviderError('The provider base URL is not a valid URL');
  }
  if (
    parsed.protocol !== 'https:' &&
    parsed.hostname !== 'localhost' &&
    parsed.hostname !== '127.0.0.1'
  ) {
    throw new ProviderError(
      'Only HTTPS providers and local servers are allowed',
    );
  }
  return `${parsed.protocol}//${parsed.hostname}/*`;
}

/** Return the endpoint a provider call is sent to. */
export function endpointFor(profile: ProviderProfile): string {
  if (profile.apiFormat === 'tabman-local') {
    return profile.baseUrl || 'local://tabman-ai';
  }
  const base = profile.baseUrl.replace(/\/+$/, '');
  if (profile.apiFormat === 'ollama') {
    return `${base}/api/chat`;
  }
  if (profile.apiFormat === 'responses') {
    return base.endsWith('/v1') ? `${base}/responses` : `${base}/v1/responses`;
  }
  if (profile.apiFormat === 'anthropic') {
    return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
  }
  return base.endsWith('/v1')
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
}

/** Build the prompt that asks a model to group every tab exactly once. */
export function buildPrompt(
  tabs: OrganizeTab[],
  includeFullUrl: boolean,
): string {
  const inputs = tabs.map((tab) => ({
    tabId: tab.id,
    title: tab.title,
    hostname: tab.hostname,
    ...(includeFullUrl && tab.url ? { url: tab.url } : {}),
  }));
  return (
    'Group every input tab into one concise collection and up to 12 tags. ' +
    'Return only JSON shaped {"items":[{"tabId":"uuid",' +
    '"collectionName":"name","tags":["tag"]}]}. ' +
    `Inputs: ${JSON.stringify(inputs)}`
  );
}

/** Pull a JSON document out of a model response. */
export function extractJson(text: string): unknown {
  let candidate = text.trim();
  if (candidate.startsWith('```')) {
    const lines = candidate.split('\n');
    candidate = lines
      .slice(1, lines.at(-1)?.trim().startsWith('```') ? -1 : undefined)
      .join('\n')
      .trim();
  }
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) {
      throw new ProviderError('The provider did not return JSON');
    }
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      throw new ProviderError('The provider returned malformed JSON');
    }
  }
}

/** Validate that the model mapped every tab exactly once. */
export function validateBatch(
  payload: unknown,
  tabs: OrganizeTab[],
): Suggestion[] {
  const batch = suggestionBatchSchema.parse(payload);
  const expected = new Set(tabs.map((tab) => tab.id));
  const seen = new Set<string>();
  for (const item of batch.items) {
    if (!expected.has(item.tabId)) {
      throw new ProviderError('The provider returned an unknown tab');
    }
    if (seen.has(item.tabId)) {
      throw new ProviderError('The provider returned a tab twice');
    }
    seen.add(item.tabId);
  }
  if (seen.size !== expected.size) {
    throw new ProviderError('The provider did not map every tab');
  }
  return batch.items;
}

async function readText(
  response: Response,
  provider: ProviderProfile,
): Promise<string> {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 240);
    throw new ProviderError(
      `${provider.name} answered with HTTP ${response.status}: ${detail}`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ProviderError(`${provider.name} returned a malformed response`);
  }
  if (typeof payload !== 'object' || payload === null) {
    throw new ProviderError(`${provider.name} returned an empty response`);
  }
  return extractProviderText(payload, provider);
}

function extractProviderText(
  payload: object,
  provider: ProviderProfile,
): string {
  if (provider.apiFormat === 'ollama') {
    const message = (payload as { message?: { content?: unknown } }).message;
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content;
    }
    throw new ProviderError(`${provider.name} returned no text`);
  }
  if (provider.apiFormat === 'anthropic') {
    const content = (payload as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const text = content
        .map((block) =>
          typeof block === 'object' && block !== null
            ? String((block as { text?: unknown }).text ?? '')
            : '',
        )
        .join('');
      if (text.trim()) {
        return text;
      }
    }
    throw new ProviderError(`${provider.name} returned no text`);
  }
  if (provider.apiFormat === 'responses') {
    const output = (payload as { output?: unknown; output_text?: unknown })
      .output;
    if (
      typeof (payload as { output_text?: unknown }).output_text === 'string'
    ) {
      return String((payload as { output_text: string }).output_text);
    }
    if (Array.isArray(output)) {
      const text = output
        .flatMap((item) => {
          if (typeof item !== 'object' || item === null) {
            return [];
          }
          const blocks = (item as { content?: unknown }).content;
          if (!Array.isArray(blocks)) {
            return [];
          }
          return blocks
            .filter(
              (block) =>
                typeof block === 'object' &&
                block !== null &&
                ['output_text', 'text'].includes(
                  String((block as { type?: unknown }).type ?? ''),
                ),
            )
            .map((block) => String((block as { text?: unknown }).text ?? ''));
        })
        .join('');
      if (text.trim()) {
        return text;
      }
    }
    throw new ProviderError(`${provider.name} returned no text`);
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const message = (choices[0] as { message?: { content?: unknown } }).message;
    const content = message?.content;
    if (typeof content === 'string' && content.trim()) {
      return content;
    }
    if (Array.isArray(content)) {
      const text = content
        .map((part) =>
          typeof part === 'object' && part !== null
            ? String((part as { text?: unknown }).text ?? '')
            : '',
        )
        .join('');
      if (text.trim()) {
        return text;
      }
    }
  }
  throw new ProviderError(`${provider.name} returned no text`);
}

/** Ask the provider to group the tabs, and validate the answer. */
export async function requestSuggestions(
  profile: ProviderProfile,
  apiKey: string,
  tabs: OrganizeTab[],
  includeFullUrl: boolean,
): Promise<Suggestion[]> {
  const prompt = buildPrompt(tabs, includeFullUrl);
  let response: Response;
  if (profile.apiFormat === 'ollama') {
    response = await fetch(endpointFor(profile), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: profile.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json',
        options: { temperature: 0 },
      }),
    });
  } else if (profile.apiFormat === 'anthropic') {
    response = await fetch(endpointFor(profile), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: profile.model,
        max_tokens: 4096,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } else if (profile.apiFormat === 'responses') {
    response = await fetch(endpointFor(profile), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: profile.model, input: prompt }),
    });
  } else {
    response = await fetch(endpointFor(profile), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: profile.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });
  }
  const text = await readText(response, profile);
  return validateBatch(extractJson(text), tabs);
}

export interface ParsedRule {
  collectionName: string;
  patterns: RegExp[];
}

export const DEFAULT_PREBUILT_RULES_JSONL = `{"group": "AI & LLMs", "patterns": ["*chatgpt.com*", "*claude.ai*", "*gemini.google.com*", "*kimi.ai*", "*kimi.moonshot.cn*", "*perplexity.ai*", "*deepseek.com*"]}
{"group": "Media & Streaming", "patterns": ["*youtube.com*", "*youtu.be*", "*twitch.tv*", "*netflix.com*", "*spotify.com*", "*vimeo.com*"]}
{"group": "Development", "patterns": ["*github.com*", "*gitlab.com*", "*stackoverflow.com*", "*npmjs.com*", "*developer.mozilla.org*"]}
{"group": "Social & Community", "patterns": ["*x.com*", "*twitter.com*", "*reddit.com*", "*linkedin.com*", "*news.ycombinator.com*"]}
{"group": "Tools & Docs", "patterns": ["*notion.so*", "*figma.com*", "*docs.google.com*", "*linear.app*"]}`;

function compilePattern(pattern: string): RegExp {
  const p = pattern.trim();
  if (p.startsWith('/') && p.endsWith('/') && p.length > 2) {
    try {
      return new RegExp(p.slice(1, -1), 'i');
    } catch {
      // fallback to wildcard if invalid regex literal
    }
  }
  const escaped = p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(escaped, 'i');
}

export function parseLocalRules(rulesText?: string): ParsedRule[] {
  if (!rulesText?.trim()) return [];
  const trimmed = rulesText.trim();
  const rules: ParsedRule[] = [];

  // Try parsing as full JSON array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsedArray = JSON.parse(trimmed) as Array<Record<string, unknown>>;
      if (Array.isArray(parsedArray)) {
        for (const item of parsedArray) {
          const name = String(
            item.group || item.name || item.collectionName || '',
          ).trim();
          const raw = Array.isArray(item.patterns || item.match)
            ? ((item.patterns || item.match) as string[])
            : [];
          if (name && raw.length > 0) {
            rules.push({
              collectionName: name,
              patterns: raw.map(String).map(compilePattern),
            });
          }
        }
        if (rules.length > 0) return rules;
      }
    } catch {
      // fallback to line-by-line
    }
  }

  // Parse line-by-line (supports JSONL and human-friendly formats)
  const lines = trimmed
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        const obj = JSON.parse(line) as Record<string, unknown>;
        const name = String(
          obj.group || obj.name || obj.collectionName || '',
        ).trim();
        const raw = Array.isArray(obj.patterns || obj.match)
          ? ((obj.patterns || obj.match) as string[])
          : typeof obj.patterns === 'string'
            ? [obj.patterns]
            : [];
        if (name && raw.length > 0) {
          rules.push({
            collectionName: name,
            patterns: raw.map(String).map(compilePattern),
          });
          continue;
        }
      } catch {
        // fallback to standard line parser
      }
    }

    let name = '';
    let rawPatterns: string[] = [];
    if (line.includes(':')) {
      const parts = line.split(':');
      name = parts[0]?.trim() ?? '';
      rawPatterns = (parts[1] ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
    } else if (line.includes('->')) {
      const parts = line.split('->');
      rawPatterns = (parts[0] ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);
      name = parts[1]?.trim() ?? '';
    } else {
      const p = line.trim();
      const host = p
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/\*.*$/, '');
      const parts = host.split('.').filter(Boolean);
      name = parts.at(-2) ?? parts[0] ?? p;
      rawPatterns = [p];
    }
    if (name && rawPatterns.length > 0) {
      rules.push({
        collectionName: name,
        patterns: rawPatterns.map(compilePattern),
      });
    }
  }
  return rules;
}

const TLD_BLACKLIST = new Set([
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'mil',
  'int',
  'io',
  'ai',
  'co',
  'app',
  'dev',
  'me',
  'info',
  'biz',
  'tv',
  'cc',
  'uk',
  'ca',
  'de',
  'jp',
  'fr',
  'au',
  'in',
  'cn',
  'ru',
  'br',
  'nl',
  'se',
  'no',
  'es',
  'it',
  'ch',
  'xyz',
  'tech',
  'online',
  'site',
  'store',
  'cloud',
  'pro',
  'www',
]);

function extractMeaningfulTags(hostname: string): string[] {
  const parts = hostname
    .toLowerCase()
    .split('.')
    .filter((part) => part.length > 0 && !TLD_BLACKLIST.has(part));
  if (parts.length === 0) {
    return [];
  }
  return parts.slice(-2).map((label) => label.slice(0, 64));
}

/** Group the tabs by hostname or local rules without contacting any service. */
export function deterministicSuggestions(
  tabs: OrganizeTab[],
  rulesText?: string,
): Suggestion[] {
  const parsedRules = parseLocalRules(rulesText);

  return tabs.map((tab) => {
    const labels = tab.hostname.split('.').filter((part) => part.length > 0);
    const meaningfulParts = labels.filter(
      (part) => !TLD_BLACKLIST.has(part.toLowerCase()),
    );
    const defaultName = (
      meaningfulParts.at(-1) ??
      labels.at(-2) ??
      labels[0] ??
      tab.hostname ??
      'Tabs'
    ).slice(0, 120);
    const tags = extractMeaningfulTags(tab.hostname);

    if (parsedRules.length > 0) {
      for (const rule of parsedRules) {
        if (
          rule.patterns.some(
            (re) =>
              (tab.url ? re.test(tab.url) : false) || re.test(tab.hostname),
          )
        ) {
          return {
            tabId: tab.id,
            collectionName: rule.collectionName,
            tags,
          };
        }
      }
    }

    return {
      tabId: tab.id,
      collectionName: defaultName || 'Tabs',
      tags,
    };
  });
}

/**
 * Project a tab title and URL into a normalized 128d semantic feature vector.
 */
export function tabToFeatureVector(tab: OrganizeTab, dim = 128): Float32Array {
  const vec = new Float32Array(dim);
  const text = `${tab.title} ${tab.hostname} ${tab.url ?? ''}`.toLowerCase();
  const tokenRes = fastTokenize(text, 32);
  for (let i = 0; i < tokenRes.length; i++) {
    const tok = Number(tokenRes.tokens[i] ?? 0n);
    if (tok === 0 || tok === 2) continue;
    const bucket = Math.abs(tok) % dim;
    vec[bucket] = (vec[bucket] ?? 0) + 1.0;
  }
  for (let i = 0; i < Math.min(text.length - 2, 64); i++) {
    const h =
      (text.charCodeAt(i) * 31 + text.charCodeAt(i + 1)) * 31 +
      text.charCodeAt(i + 2);
    const b = Math.abs(h) % dim;
    vec[b] = (vec[b] ?? 0) + 0.5;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    const val = vec[i] ?? 0;
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  if (norm > 1e-9) {
    for (let i = 0; i < dim; i++) {
      vec[i] = (vec[i] ?? 0) / norm;
    }
  }
  return vec;
}

/**
 * Cluster tabs semantically into k collections using Rust WASM K-Means (Kernel 3).
 */
export function clusterTabsSemantically(
  tabs: OrganizeTab[],
  k: number,
  maxIterations = 20,
): Suggestion[] {
  if (tabs.length === 0 || k <= 0) return [];
  const targetK = Math.min(k, tabs.length);
  const vectors = tabs.map((t) => tabToFeatureVector(t, 128));
  const res = clusterTabs(vectors, targetK, maxIterations, 128);

  const clusterTabsMap = new Map<number, OrganizeTab[]>();
  for (let i = 0; i < tabs.length; i++) {
    const cId = res.assignments[i] ?? 0;
    const tab = tabs[i];
    if (tab) {
      const list = clusterTabsMap.get(cId) ?? [];
      list.push(tab);
      clusterTabsMap.set(cId, list);
    }
  }

  const clusterMetaMap = new Map<number, { name: string; tags: string[] }>();
  for (const [cId, cTabs] of clusterTabsMap) {
    const hostCounts = new Map<string, number>();
    for (const t of cTabs) {
      hostCounts.set(t.hostname, (hostCounts.get(t.hostname) ?? 0) + 1);
    }
    let dominantHost = cTabs[0]?.hostname ?? 'Tabs';
    let maxCount = 0;
    for (const [h, count] of hostCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominantHost = h;
      }
    }
    const labels = dominantHost.split('.').filter((part) => part.length > 0);
    const meaningfulParts = labels.filter(
      (part) => !TLD_BLACKLIST.has(part.toLowerCase()),
    );
    const clusterName = (
      meaningfulParts.at(-1) ??
      labels.at(-2) ??
      labels[0] ??
      dominantHost
    ).slice(0, 120);

    const allTags = new Set<string>();
    for (const t of cTabs) {
      for (const tag of extractMeaningfulTags(t.hostname)) {
        allTags.add(tag);
      }
    }
    clusterMetaMap.set(cId, {
      name: clusterName || 'Tabs',
      tags: Array.from(allTags).slice(0, 5),
    });
  }

  return tabs.map((tab, i) => {
    const cId = res.assignments[i] ?? 0;
    const meta = clusterMetaMap.get(cId) ?? {
      name: tab.hostname || 'Tabs',
      tags: extractMeaningfulTags(tab.hostname),
    };
    return {
      tabId: tab.id,
      collectionName: meta.name,
      tags: meta.tags,
    };
  });
}

/**
 * Compute the pairwise cosine similarity matrix across open tabs using Rust WASM (Kernel 1).
 */
export function computeTabSimilarityMatrix(
  tabs: OrganizeTab[],
  dim = 128,
): Float32Array {
  if (tabs.length === 0) return new Float32Array(0);
  const vectors = tabs.map((t) => tabToFeatureVector(t, dim));
  return computePairwiseCosine(vectors, dim);
}

/**
 * Search the top-K most semantically related candidate tabs using Top-K Vector Search (Kernel 2).
 */
export function searchTopRelatedTabs(
  queryTab: OrganizeTab,
  candidateTabs: OrganizeTab[],
  k = 5,
): OrganizeTab[] {
  if (candidateTabs.length === 0 || k <= 0) return [];
  const queryVec = tabToFeatureVector(queryTab, 128);
  const candVecs = candidateTabs.map((t) => tabToFeatureVector(t, 128));
  const topResults = searchTopKTabs(queryVec, candVecs, k, 128);
  const matches: OrganizeTab[] = [];
  for (const res of topResults) {
    const cand = candidateTabs[res.index];
    if (cand) matches.push(cand);
  }
  return matches;
}

/**
 * Project high-dimensional embedding vectors down to target dimension using Matryoshka Slicing (Kernel 7).
 */
export function projectTabEmbeddings(
  embeddings: Float32Array[],
  targetDim = 128,
): Float32Array[] {
  return matryoshkaSlice(embeddings, targetDim);
}

/**
 * Zero-dependency semantic tab categorization matching Tabman EmbeddingGemma's
 * 18 curated domain verticals and high-affinity topics.
 */
export function localSemanticSuggestions(
  tabs: OrganizeTab[],
  _modelId?: string,
): Suggestion[] {
  const results: (Suggestion | null)[] = new Array(tabs.length).fill(null);
  const unclassifiedIndices: number[] = [];

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (!tab) continue;
    const titleLower = tab.title.toLowerCase();
    const urlLower = (tab.url || '').toLowerCase();
    const hostLower = tab.hostname.toLowerCase();
    const text = `${titleLower} ${urlLower} ${hostLower}`;

    // 1. Localhost & Internal Dev
    if (
      /localhost|127\.0\.0\.1|0\.0\.0\.0|::1|192\.168\.|10\.0\./i.test(
        hostLower,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Localhost & Internal Dev',
        tags: ['local', 'dev', 'internal'],
      };
      continue;
    }

    // 2. Research & Academic Papers
    if (
      /arxiv\.org|biorxiv|openreview|ieee|researchgate|paperswithcode|doi\.org|\bpaper\b|\bacadem/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Research & Papers',
        tags: ['research', 'papers', 'academic'],
      };
      continue;
    }

    // 3. Video & Tutorials
    if (
      /youtube\.com|youtu\.be|twitch\.tv|vimeo\.com|udemy\.com|coursera|\bvideo\b|\btutorial\b/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Video & Tutorials',
        tags: ['video', 'media', 'learning'],
      };
      continue;
    }

    // 4. Audio & Podcasts
    if (
      /spotify\.com|soundcloud\.com|music\.apple\.com|podcast|audio|bandcamp/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Audio & Podcasts',
        tags: ['audio', 'music', 'podcast'],
      };
      continue;
    }

    // 5. Machine Learning & AI
    if (
      /hugging\s?face|transformers|pytorch|torch|tensorflow|llm|embedding|openai|anthropic|gemma|mistral|ollama|deepseek|lora|safetensors|onnx/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Machine Learning & AI',
        tags: ['ai', 'ml', 'models'],
      };
      continue;
    }

    // 6. Cloud & DevOps
    if (
      /aws|amazon web services|ecs|ec2|s3|iam|gcp|google cloud|azure|kubernetes|k8s|docker|terraform|helm|ci\/cd|devops|grafana|prometheus/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Cloud & DevOps',
        tags: ['cloud', 'devops', 'infra'],
      };
      continue;
    }

    // 7. API References & Docs
    if (
      /developer\.mozilla\.org|stripe\.com\/docs|api reference|swagger|openapi|postman|\/docs|\/api\//i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'API References & Docs',
        tags: ['api', 'docs', 'reference'],
      };
      continue;
    }

    // 8. Frontend & UI Engineering
    if (
      /react|vue|angular|svelte|next\.?js|vite|tailwind|\bcss3?\b|\bhtml5?\b|frontend|\bui\b|component|hooks|redux|zustand/i.test(
        text,
      ) &&
      !/arxiv|paper|dataset/i.test(text)
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Frontend & UI Engineering',
        tags: ['frontend', 'ui', 'web-dev'],
      };
      continue;
    }

    // 10. Productivity & Workspace
    if (
      /notion\.so|docs\.google\.com|sheets\.google\.com|slack\.com|linear\.app|jira|trello|asana|workspace/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Productivity & Workspace',
        tags: ['productivity', 'work', 'notes'],
      };
      continue;
    }

    // 11. Design & UX
    if (
      /figma\.com|dribbble\.com|behance\.net|canva\.com|unsplash|font|icon|design system/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Design & UX',
        tags: ['design', 'ui', 'creative'],
      };
      continue;
    }

    // 12. Community & Discussions
    if (
      /github\.com\/.*\/issues|github\.com\/.*\/discussions|stackoverflow\.com|reddit\.com|news\.ycombinator\.com|discord\.com/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Community & Discussions',
        tags: ['community', 'discussion', 'forums'],
      };
      continue;
    }

    // 13. Finance & Markets
    if (
      /robinhood|bloomberg|yahoo finance|coinbase|binance|crypto|trading|banking|stock/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Finance & Markets',
        tags: ['finance', 'markets', 'investing'],
      };
      continue;
    }

    // 14. E-Commerce & Shopping
    if (
      /amazon\.com|ebay\.com|shopify|aliexpress|walmart|bestbuy|store|shop|cart/i.test(
        text,
      )
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Shopping & Hardware',
        tags: ['shopping', 'products', 'commerce'],
      };
      continue;
    }

    // 15. Career & Jobs
    if (
      /linkedin\.com|greenhouse\.io|lever\.co|indeed\.com|jobs\./i.test(text)
    ) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Career & Jobs',
        tags: ['career', 'jobs', 'recruiting'],
      };
      continue;
    }

    // 16. Travel & Navigation
    if (/maps\.google|airbnb|booking\.com|expedia|flights/i.test(text)) {
      results[i] = {
        tabId: tab.id,
        collectionName: 'Travel & Navigation',
        tags: ['travel', 'navigation', 'booking'],
      };
      continue;
    }

    unclassifiedIndices.push(i);
  }

  // Handle unclassified tabs:
  if (unclassifiedIndices.length === 1) {
    const idx = unclassifiedIndices[0];
    if (idx !== undefined) {
      const tab = tabs[idx];
      if (tab) {
        const labels = tab.hostname
          .split('.')
          .filter((part) => part.length > 0);
        const meaningfulParts = labels.filter(
          (part) => !TLD_BLACKLIST.has(part.toLowerCase()),
        );
        const defaultName = (
          meaningfulParts.at(-1) ??
          labels.at(-2) ??
          labels[0] ??
          tab.hostname ??
          'Tabs'
        ).slice(0, 120);
        results[idx] = {
          tabId: tab.id,
          collectionName: defaultName || 'Tabs',
          tags: extractMeaningfulTags(tab.hostname),
        };
      }
    }
  } else if (unclassifiedIndices.length >= 2) {
    // Rust WASM Kernel 4: Auto-K Density Tab Clustering
    const unclassifiedTabs = unclassifiedIndices.flatMap((i) => {
      const t = tabs[i];
      return t ? [t] : [];
    });
    const vectors = unclassifiedTabs.map((tab) => tabToFeatureVector(tab, 128));
    const clusterResult = autoKCluster(vectors, 2, 128);

    const clusterTabsMap = new Map<number, OrganizeTab[]>();
    for (let u = 0; u < unclassifiedTabs.length; u++) {
      const clusterId = clusterResult.assignments[u] ?? 0;
      const tab = unclassifiedTabs[u];
      if (tab) {
        const list = clusterTabsMap.get(clusterId) ?? [];
        list.push(tab);
        clusterTabsMap.set(clusterId, list);
      }
    }

    const clusterNamesMap = new Map<number, { name: string; tags: string[] }>();
    for (const [clusterId, cTabs] of clusterTabsMap) {
      const hostCounts = new Map<string, number>();
      for (const t of cTabs) {
        hostCounts.set(t.hostname, (hostCounts.get(t.hostname) ?? 0) + 1);
      }
      let dominantHost = cTabs[0]?.hostname ?? 'Tabs';
      let maxCount = 0;
      for (const [h, count] of hostCounts) {
        if (count > maxCount) {
          maxCount = count;
          dominantHost = h;
        }
      }

      const labels = dominantHost.split('.').filter((part) => part.length > 0);
      const meaningfulParts = labels.filter(
        (part) => !TLD_BLACKLIST.has(part.toLowerCase()),
      );
      const clusterName = (
        meaningfulParts.at(-1) ??
        labels.at(-2) ??
        labels[0] ??
        dominantHost
      ).slice(0, 120);

      const allTags = new Set<string>();
      for (const t of cTabs) {
        for (const tag of extractMeaningfulTags(t.hostname)) {
          allTags.add(tag);
        }
      }
      clusterNamesMap.set(clusterId, {
        name: clusterName || 'Tabs',
        tags: Array.from(allTags).slice(0, 5),
      });
    }

    for (let u = 0; u < unclassifiedIndices.length; u++) {
      const idx = unclassifiedIndices[u];
      if (idx === undefined) continue;
      const tab = tabs[idx];
      if (!tab) continue;
      const clusterId = clusterResult.assignments[u] ?? 0;
      const clusterMeta = clusterNamesMap.get(clusterId) ?? {
        name: tab.hostname || 'Tabs',
        tags: extractMeaningfulTags(tab.hostname),
      };
      results[idx] = {
        tabId: tab.id,
        collectionName: clusterMeta.name,
        tags: clusterMeta.tags,
      };
    }
  }

  return results.filter((s): s is Suggestion => s !== null);
}
