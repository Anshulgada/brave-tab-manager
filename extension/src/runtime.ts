import type { SwitchboardRequest, SwitchboardResponse } from './messages';

export async function sendSwitchboardRequest(
  message: SwitchboardRequest,
): Promise<SwitchboardResponse> {
  const g = globalThis as unknown as {
    browser?: { runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> } };
    chrome?: { runtime?: { sendMessage?: (msg: unknown) => Promise<unknown> } };
  };
  const sendMsg =
    g.browser?.runtime?.sendMessage?.bind(g.browser.runtime) ??
    g.chrome?.runtime?.sendMessage?.bind(g.chrome.runtime);

  if (!sendMsg) {
    // Graceful fallback when previewed outside an active extension context
    return { ok: true } as SwitchboardResponse;
  }

  const attempt = async (): Promise<SwitchboardResponse> => {
    const response = (await sendMsg(message)) as SwitchboardResponse;
    if (!response || typeof response !== 'object' || !('ok' in response)) {
      throw new Error('The extension background service did not respond');
    }
    return response;
  };
  try {
    return await attempt();
  } catch (error) {
    // The service worker may still be waking up; try once more.
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      return await attempt();
    } catch {
      throw error;
    }
  }
}
