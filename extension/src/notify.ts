/** Notifications the background worker sends to the open surfaces. */

export async function notifySwitchboardChanged(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'switchboard/changed' });
  } catch {
    // No switchboard surface is listening.
  }
}

export async function notifyLibraryChanged(): Promise<void> {
  try {
    await browser.runtime.sendMessage({ type: 'library/changed' });
  } catch {
    // No library surface is listening.
  }
}
