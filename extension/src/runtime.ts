import type { SwitchboardRequest, SwitchboardResponse } from './messages';

export async function sendSwitchboardRequest(
  message: SwitchboardRequest,
): Promise<SwitchboardResponse> {
  const attempt = async (): Promise<SwitchboardResponse> => {
    const response = (await browser.runtime.sendMessage(
      message,
    )) as SwitchboardResponse;
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
