/**
 * Batched organization for the browser and the provider settings that drive it.
 *
 * The worker collects the open tabs, asks the provider for one suggestion per
 * tab, and validates the answer before it reaches the page. The page then
 * writes the proposal into the library.
 */

import {
  deterministicSuggestions,
  type OrganizeTab,
  originPattern,
  type ProviderProfile,
  type ProviderSettings,
  providerProfileSchema,
  requestSuggestions,
} from './ai';
import { TabmanDatabase, type TabRecord } from './database';
import type { OrganizeProposal, OrganizeProposalItem } from './messages';
import {
  forgetApiKey,
  hasApiKey,
  loadApiKey,
  loadProviderSettings,
  saveProviderSettings,
  storeApiKey,
} from './provider-store';
import { collectionSchema, tabSchema } from './schema';

export class OrganizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizeError';
  }
}

/** Collect the open tabs that can be organized. */
export async function collectOpenTabs(): Promise<OrganizeTab[]> {
  const tabs = await browser.tabs.query({});
  const collected: OrganizeTab[] = [];
  for (const tab of tabs) {
    if (tab.incognito || tab.id === undefined || !tab.url) {
      continue;
    }
    let parsed: URL;
    try {
      parsed = new URL(tab.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue;
    }
    collected.push({
      id: crypto.randomUUID(),
      title: (tab.title ?? parsed.hostname).slice(0, 2048),
      hostname: parsed.hostname.slice(0, 253),
      url: tab.url,
    });
  }
  return collected;
}

/** Ask the provider for a proposal, or fall back to the local rules. */
export async function buildProposal(
  mode: 'provider' | 'deterministic',
): Promise<OrganizeProposal> {
  const tabs = await collectOpenTabs();
  if (tabs.length === 0) {
    throw new OrganizeError('There are no open tabs to organize');
  }
  const createdAt = new Date().toISOString();

  if (mode === 'deterministic') {
    const suggestions = deterministicSuggestions(tabs);
    return {
      provider: 'deterministic',
      createdAt,
      items: suggestions.map((suggestion): OrganizeProposalItem => {
        const tab = tabs.find((candidate) => candidate.id === suggestion.tabId);
        return {
          tabId: suggestion.tabId,
          title: tab?.title ?? '',
          url: tab?.url ?? '',
          hostname: tab?.hostname ?? '',
          collectionName: suggestion.collectionName,
          tags: suggestion.tags,
        };
      }),
    };
  }

  const settings = await loadProviderSettings();
  const profile = activeProfile(settings);
  if (!profile) {
    throw new OrganizeError('Add and activate a provider first');
  }
  const apiKey = await loadApiKey(settings.rememberKey);
  if (!apiKey) {
    throw new OrganizeError(`No API key is stored for ${profile.name}`);
  }
  await grantHostPermission(profile);
  const suggestions = await requestSuggestions(profile, apiKey, tabs, false);
  return {
    provider: profile.name,
    createdAt,
    items: suggestions.map((suggestion): OrganizeProposalItem => {
      const tab = tabs.find((candidate) => candidate.id === suggestion.tabId);
      return {
        tabId: suggestion.tabId,
        title: tab?.title ?? '',
        url: tab?.url ?? '',
        hostname: tab?.hostname ?? '',
        collectionName: suggestion.collectionName,
        tags: suggestion.tags,
      };
    }),
  };
}

/** Return the profile the settings point at. */
export function activeProfile(
  settings: ProviderSettings,
): ProviderProfile | undefined {
  return settings.providers.find(
    (profile) => profile.id === settings.activeProviderId,
  );
}

/** Ask the browser for the host permission the provider needs. */
export async function grantHostPermission(
  profile: ProviderProfile,
): Promise<void> {
  const pattern = originPattern(profile.baseUrl);
  const granted = await browser.permissions.contains({ origins: [pattern] });
  if (granted) {
    return;
  }
  const request = await browser.permissions.request({ origins: [pattern] });
  if (!request) {
    throw new OrganizeError(
      `Tabman needs permission to reach ${pattern} before it can use ${profile.name}`,
    );
  }
}

/** Return the provider settings and whether a key is stored. */
export async function readProviderSettings(): Promise<{
  settings: ProviderSettings;
  hasKey: boolean;
}> {
  const settings = await loadProviderSettings();
  return { settings, hasKey: await hasApiKey(settings.rememberKey) };
}

/** Add or update a provider profile. */
export async function upsertProvider(
  payload: unknown,
): Promise<ProviderSettings> {
  const profile = providerProfileSchema.parse(payload);
  const settings = await loadProviderSettings();
  const others = settings.providers.filter(
    (candidate) => candidate.id !== profile.id,
  );
  const next: ProviderSettings = {
    ...settings,
    providers: [...others, profile],
    activeProviderId: settings.activeProviderId ?? profile.id,
  };
  await saveProviderSettings(next);
  return next;
}

/** Remove a provider profile. */
export async function removeProvider(id: string): Promise<ProviderSettings> {
  const settings = await loadProviderSettings();
  const next: ProviderSettings = {
    ...settings,
    providers: settings.providers.filter((profile) => profile.id !== id),
    activeProviderId:
      settings.activeProviderId === id ? null : settings.activeProviderId,
  };
  await saveProviderSettings(next);
  return next;
}

/** Choose the provider the organizer uses. */
export async function activateProvider(id: string): Promise<ProviderSettings> {
  const settings = await loadProviderSettings();
  if (!settings.providers.some((profile) => profile.id === id)) {
    throw new OrganizeError('That provider does not exist');
  }
  const next: ProviderSettings = { ...settings, activeProviderId: id };
  await saveProviderSettings(next);
  return next;
}

/** Store the API key for the active provider. */
export async function setApiKey(key: string, remember: boolean): Promise<void> {
  const settings = await loadProviderSettings();
  await storeApiKey(key, remember);
  await saveProviderSettings({ ...settings, rememberKey: remember });
}

/** Forget the stored API key. */
export async function forgetStoredKey(): Promise<void> {
  await forgetApiKey();
}

/** Open the saved tabs of a collection in the browser. */
export async function restoreCollection(
  collectionId: string,
): Promise<{ ok: true; affected: number; warnings?: string[] }> {
  const database = new TabmanDatabase();
  const warnings: string[] = [];
  let affected = 0;
  try {
    const collection = await database.collections.get(collectionId);
    if (!collection) {
      throw new OrganizeError('That collection no longer exists');
    }
    const tabs = await database.tabs
      .where('collectionId')
      .equals(collectionId)
      .toArray();
    for (const tab of tabs) {
      if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) {
        warnings.push(`${tab.title || tab.url} cannot be opened`);
        continue;
      }
      try {
        await browser.tabs.create({ url: tab.url, active: false });
        affected += 1;
      } catch {
        warnings.push(`${tab.title || tab.url} could not be opened`);
      }
    }
  } finally {
    database.close();
  }
  if (affected === 0) {
    throw new OrganizeError('That collection has no tabs to restore');
  }
  return { ok: true, affected, ...(warnings.length > 0 ? { warnings } : {}) };
}

/** Write a proposal into the library as collections and tabs. */
export async function applyProposal(
  proposal: OrganizeProposal,
): Promise<{ collections: number; tabs: number }> {
  const groups = new Map<string, OrganizeProposalItem[]>();
  for (const item of proposal.items) {
    const name = item.collectionName.trim().slice(0, 120) || 'Tabs';
    const bucket = groups.get(name);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(name, [item]);
    }
  }
  if (groups.size === 0) {
    throw new OrganizeError('The proposal has no tabs');
  }

  const database = new TabmanDatabase();
  const now = new Date().toISOString();
  let tabCount = 0;
  try {
    await database.transaction(
      'rw',
      [database.collections, database.tabs, database.tags],
      async () => {
        for (const [name, items] of groups) {
          const collectionId = crypto.randomUUID();
          const tagNames = new Map<string, string>();
          for (const item of items) {
            for (const tag of item.tags) {
              const key = tag.trim().toLocaleLowerCase();
              if (key && !tagNames.has(key)) {
                tagNames.set(key, tag.trim().slice(0, 64));
              }
            }
          }
          const tags = [...tagNames.values()].map((label) => ({
            id: crypto.randomUUID(),
            name: label,
            color: null,
            collectionId,
            sortOrder: tagNames.size,
          }));
          const tagIds = new Map(
            tags.map((tag) => [tag.name.toLocaleLowerCase(), tag.id]),
          );
          const records: TabRecord[] = items.map((item, index) => {
            const tab = tabSchema.parse({
              id: crypto.randomUUID(),
              title: item.title.slice(0, 2048),
              url: item.url,
              hostname: item.hostname.slice(0, 253),
              pinned: false,
              position: index,
              createdAt: now,
              lastAccessedAt: null,
              tagIds: item.tags.flatMap((tag) => {
                const id = tagIds.get(tag.trim().toLocaleLowerCase());
                return id ? [id] : [];
              }),
            });
            return {
              ...tab,
              collectionId,
              normalizedHostname: tab.hostname.toLocaleLowerCase(),
            };
          });
          const collection = collectionSchema.parse({
            id: collectionId,
            name,
            description: `Organized by ${proposal.provider}`,
            color: null,
            createdAt: now,
            updatedAt: now,
            status: 'active',
            tags: tags.map(
              ({
                collectionId: _collectionId,
                sortOrder: _sortOrder,
                ...tag
              }) => tag,
            ),
            tabs: records.map(
              ({
                collectionId: _collectionId,
                normalizedHostname: _hostname,
                ...tab
              }) => tab,
            ),
          });
          const { tabs: _tabs, tags: _tags, ...collectionRecord } = collection;
          await database.collections.add(collectionRecord);
          await database.tabs.bulkAdd(records);
          tabCount += records.length;
        }
      },
    );
  } finally {
    database.close();
  }
  return { collections: groups.size, tabs: tabCount };
}
