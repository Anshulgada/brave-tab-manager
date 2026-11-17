/**
 * Iframely Rich Preview client and cache layer.
 *
 * Provides visual rich bookmark cards (Raindrop.io style) including
 * thumbnail covers, metadata, favicons, and domain tags using individual user API keys.
 */

export interface IframelyPreview {
  url: string;
  title?: string;
  description?: string;
  site?: string;
  author?: string;
  favicon?: string;
  thumbnailUrl?: string;
  mediaWidth?: number;
  mediaHeight?: number;
  html?: string;
}

export interface IframelyApiResponse {
  url?: string;
  meta?: {
    title?: string;
    description?: string;
    site?: string;
    author?: string;
    favicon?: string;
    canonical?: string;
  };
  links?: {
    thumbnail?: Array<{
      href: string;
      media?: { width?: number; height?: number };
    }>;
    icon?: Array<{ href: string }>;
  };
  html?: string;
}

/** Parse an Iframely JSON payload into normalized preview card fields. */
export function parseIframelyResponse(
  data: IframelyApiResponse,
): IframelyPreview {
  const meta = data?.meta || {};
  const links = data?.links || {};
  const thumbnail = Array.isArray(links.thumbnail)
    ? links.thumbnail[0]
    : links.thumbnail;
  const icon = Array.isArray(links.icon) ? links.icon[0] : links.icon;

  return {
    url: data?.url || '',
    title: meta.title || '',
    description: meta.description || '',
    site: meta.site || '',
    author: meta.author || '',
    favicon: icon?.href || meta.favicon || '',
    thumbnailUrl: thumbnail?.href || '',
    mediaWidth: thumbnail?.media?.width,
    mediaHeight: thumbnail?.media?.height,
    html: data?.html || '',
  };
}

/** Check if a cached preview exists in local storage (permanent offline cache). */
export function getCachedPreview(url: string): IframelyPreview | null {
  if (typeof globalThis.localStorage === 'undefined' || !url) return null;
  try {
    const key = `tabman_preview_${url}`;
    const raw = globalThis.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Permanent offline cache: if valid preview data exists, return it immediately
    if (parsed && (parsed.data || parsed.url)) {
      return (parsed.data || parsed) as IframelyPreview;
    }
  } catch {}
  return null;
}

/** Remove a cached preview from local storage. */
export function deleteCachedPreview(url: string): void {
  if (typeof globalThis.localStorage === 'undefined' || !url) return;
  try {
    globalThis.localStorage.removeItem(`tabman_preview_${url}`);
  } catch {}
}

/** Sync preview metadata to hierarchical on-disk storage via native sidecar. */
export function syncPreviewToDisk(
  collectionName: string,
  preview: IframelyPreview,
): void {
  const ch = (
    globalThis as unknown as {
      chrome?: {
        runtime?: {
          sendNativeMessage?: (
            host: string,
            msg: unknown,
            cb?: (resp: unknown) => void,
          ) => void;
        };
      };
    }
  ).chrome;
  if (!ch?.runtime?.sendNativeMessage) return;
  try {
    ch.runtime.sendNativeMessage(
      'com.tabman.sidecar',
      {
        type: 'previews/save',
        collection: collectionName,
        url: preview.url,
        title: preview.title,
        description: preview.description,
        site: preview.site,
        author: preview.author,
        favicon: preview.favicon,
        thumbnailUrl: preview.thumbnailUrl,
      },
      () => {},
    );
  } catch {}
}

/** Delete preview assets from disk via native sidecar when tab/collection is removed. */
export function deletePreviewFromDisk(
  collectionName: string,
  url?: string,
): void {
  const ch = (
    globalThis as unknown as {
      chrome?: {
        runtime?: {
          sendNativeMessage?: (
            host: string,
            msg: unknown,
            cb?: (resp: unknown) => void,
          ) => void;
        };
      };
    }
  ).chrome;
  if (!ch?.runtime?.sendNativeMessage) return;
  try {
    ch.runtime.sendNativeMessage(
      'com.tabman.sidecar',
      {
        type: 'previews/delete',
        collection: collectionName,
        url,
      },
      () => {},
    );
  } catch {}
}

/** Fetch preview metadata for a URL using the user's API key. */
export async function fetchIframelyPreview(
  url: string,
  apiKey: string,
  collectionName = 'default',
): Promise<IframelyPreview | null> {
  if (!url || !apiKey?.trim()) return null;

  // Check permanent cache first
  const cached = getCachedPreview(url);
  if (cached) return cached;

  try {
    const endpoint = `https://iframe.ly/api/iframely?url=${encodeURIComponent(
      url,
    )}&api_key=${encodeURIComponent(apiKey.trim())}`;
    const resp = await fetch(endpoint);
    if (!resp.ok) return null;

    const data = (await resp.json()) as IframelyApiResponse;
    const preview = parseIframelyResponse(data);

    try {
      globalThis.localStorage.setItem(
        `tabman_preview_${url}`,
        JSON.stringify({ timestamp: Date.now(), data: preview }),
      );
    } catch {}

    // Persist to disk hierarchy via native sidecar
    syncPreviewToDisk(collectionName, preview);

    return preview;
  } catch {
    return null;
  }
}

/** Test an API key with a known endpoint. */
export async function testIframelyApiKey(
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: 'Please enter an API key' };

  try {
    const endpoint = `https://iframe.ly/api/iframely?url=https%3A%2F%2Fgithub.com&api_key=${encodeURIComponent(
      key,
    )}`;
    const resp = await fetch(endpoint);
    if (resp.ok) {
      return {
        ok: true,
        message: 'Valid API key! Visual previews are active.',
      };
    }
    if (resp.status === 401 || resp.status === 403) {
      return {
        ok: false,
        message: 'Invalid API key. Check your key in your account dashboard.',
      };
    }
    return {
      ok: false,
      message: `Preview service returned status ${resp.status}`,
    };
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : 'Network error communicating with preview service',
    };
  }
}
