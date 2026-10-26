/** Platform helpers so the shortcuts read the way the reader's keyboard does. */

function detectApple(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export const isAppleDevice = detectApple();

/** The modifier key on this machine: Command on Apple, Control elsewhere. */
export const modifierKey = isAppleDevice ? '⌘' : 'Ctrl';

/** A shortcut as it should be typed, for example "Ctrl K" or "⌘K". */
export function shortcut(key: string): string {
  return isAppleDevice ? `⌘${key}` : `Ctrl ${key}`;
}
