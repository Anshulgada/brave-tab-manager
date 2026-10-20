/**
 * Provider profiles and batched organization for the extension.
 *
 * The profiles mirror the CLI: a display name, a base URL, a model, and the
 * API format. Keys never leave the browser. They live in session storage by
 * default and can be forgotten at any time.
 */

import { z } from 'zod';

export const apiFormatSchema = z.enum(['openai', 'responses', 'anthropic']);
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
  const base = profile.baseUrl.replace(/\/+$/, '');
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
  if (profile.apiFormat === 'anthropic') {
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

/** Group the tabs by hostname without contacting any service. */
export function deterministicSuggestions(tabs: OrganizeTab[]): Suggestion[] {
  return tabs.map((tab) => {
    const labels = tab.hostname.split('.').filter((part) => part.length > 0);
    const collectionName = (
      labels.at(-2) ??
      labels[0] ??
      tab.hostname ??
      'Tabs'
    ).slice(0, 120);
    const tags = labels.slice(-2).map((label) => label.slice(0, 64));
    return {
      tabId: tab.id,
      collectionName: collectionName || 'Tabs',
      tags,
    };
  });
}
