/**
 * Where the extension keeps its provider profiles and API keys.
 *
 * Profiles live in local storage so they survive a restart. Keys live in
 * session storage by default, so a key is gone as soon as the browser closes,
 * and they can be forgotten at any time.
 */

import {
  DEFAULT_PROVIDER_SETTINGS,
  type ProviderSettings,
  providerSettingsSchema,
} from './ai';

const SETTINGS_KEY = 'tabman.providers';
const SESSION_KEY = 'tabman.apiKey';
const LOCAL_KEY = 'tabman.apiKey';

type StorageArea = {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
  remove: (key: string) => Promise<void>;
};

async function area(name: 'local' | 'session'): Promise<StorageArea> {
  const storage = browser.storage as unknown as Record<string, StorageArea>;
  const candidate = storage[name];
  if (candidate) {
    return candidate;
  }
  if (name === 'session') {
    // Some builds do not ship session storage; fall back to local storage.
    return storage.local as StorageArea;
  }
  throw new Error('Browser storage is not available');
}

/** Return the stored provider settings, with the defaults when there are none. */
export async function loadProviderSettings(): Promise<ProviderSettings> {
  try {
    const local = await area('local');
    const stored = await local.get(SETTINGS_KEY);
    const parsed = providerSettingsSchema.safeParse(stored[SETTINGS_KEY]);
    return parsed.success ? parsed.data : DEFAULT_PROVIDER_SETTINGS;
  } catch {
    return DEFAULT_PROVIDER_SETTINGS;
  }
}

/** Store the provider settings. */
export async function saveProviderSettings(
  settings: ProviderSettings,
): Promise<void> {
  const local = await area('local');
  await local.set({ [SETTINGS_KEY]: providerSettingsSchema.parse(settings) });
}

/** Return the stored API key, if there is one. */
export async function loadApiKey(
  remember: boolean,
): Promise<string | undefined> {
  try {
    const storage = await area(remember ? 'local' : 'session');
    const stored = await storage.get(remember ? LOCAL_KEY : SESSION_KEY);
    const value = stored[remember ? LOCAL_KEY : SESSION_KEY];
    return typeof value === 'string' && value.trim() ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Store the API key in session storage, or in local storage when remembered. */
export async function storeApiKey(
  key: string,
  remember: boolean,
): Promise<void> {
  const value = key.trim();
  if (!value) {
    throw new Error('The API key cannot be empty');
  }
  const session = await area('session');
  await session.set({ [SESSION_KEY]: value });
  if (remember) {
    const local = await area('local');
    await local.set({ [LOCAL_KEY]: value });
  } else {
    const local = await area('local');
    await local.remove(LOCAL_KEY);
  }
}

/** Remove the API key from every place it could be. */
export async function forgetApiKey(): Promise<void> {
  for (const [name, key] of [
    ['session', SESSION_KEY],
    ['local', LOCAL_KEY],
  ] as const) {
    try {
      const storage = await area(name);
      await storage.remove(key);
    } catch {
      // A missing area simply has no key to forget.
    }
  }
}

/** Report whether a key is stored for the given preference. */
export async function hasApiKey(remember: boolean): Promise<boolean> {
  return (await loadApiKey(remember)) !== undefined;
}
