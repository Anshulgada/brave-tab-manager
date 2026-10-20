/** Formatting helpers shared by the dashboard and the side panel. */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Return a short, human relative time such as "4 min ago" or "Mar 4". */
export function relativeTime(
  value: string | undefined,
  now = Date.now(),
): string {
  if (!value) {
    return '';
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return '';
  }
  const delta = now - timestamp;
  if (delta < MINUTE) {
    return 'just now';
  }
  if (delta < HOUR) {
    const minutes = Math.floor(delta / MINUTE);
    return `${minutes} min ago`;
  }
  if (delta < DAY) {
    const hours = Math.floor(delta / HOUR);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (delta < 7 * DAY) {
    const days = Math.floor(delta / DAY);
    return days === 1 ? 'yesterday' : `${days} days ago`;
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/** Return the label used for a tab when it has no title. */
export function tabLabel(title: string, hostname: string, url: string): string {
  return title || hostname || url;
}

/** Return the hostname shown under a tab title. */
export function hostLabel(hostname: string, url: string): string {
  return hostname || url.replace(/^https?:\/\//, '').split('/')[0] || url;
}

/** Return the first letter of a host, used for the fallback avatar. */
export function hostInitial(hostname: string, url: string): string {
  const source = hostname || url.replace(/^https?:\/\//, '');
  return source.slice(0, 1).toLocaleUpperCase() || '#';
}

/** Return a count with the right noun, for example "1 tab" or "3 tabs". */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

/** Group items by a key, preserving the original order inside each group. */
export function groupBy<T>(
  items: T[],
  key: (item: T) => string,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const bucket = groups.get(groupKey);
    if (bucket) {
      bucket.push(item);
    } else {
      groups.set(groupKey, [item]);
    }
  }
  return groups;
}
