import {
  clearStaleParkingLocks,
  handleSwitchboardRequest,
  notifySwitchboardChanged,
} from '../src/background-service';
import type { SwitchboardRequest } from '../src/messages';

const REQUEST_TYPES = new Set<SwitchboardRequest['type']>([
  'switchboard/get',
  'switchboard/activate',
  'switchboard/action',
  'switchboard/move',
  'switchboard/group',
  'switchboard/park',
  'dashboard/open',
]);

export default defineBackground(() => {
  void clearStaleParkingLocks();

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefresh = () => {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
    }
    refreshTimer = setTimeout(() => {
      refreshTimer = undefined;
      void notifySwitchboardChanged();
    }, 75);
  };

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      typeof message.type !== 'string' ||
      !REQUEST_TYPES.has(message.type as SwitchboardRequest['type'])
    ) {
      return undefined;
    }
    return handleSwitchboardRequest(message);
  });

  browser.tabs.onCreated.addListener(scheduleRefresh);
  browser.tabs.onRemoved.addListener(scheduleRefresh);
  browser.tabs.onUpdated.addListener(scheduleRefresh);
  browser.tabs.onMoved.addListener(scheduleRefresh);
  browser.tabs.onAttached.addListener(scheduleRefresh);
  browser.tabs.onDetached.addListener(scheduleRefresh);
  browser.windows.onCreated.addListener(scheduleRefresh);
  browser.windows.onRemoved.addListener(scheduleRefresh);
  browser.windows.onFocusChanged.addListener(scheduleRefresh);
  browser.tabGroups.onCreated.addListener(scheduleRefresh);
  browser.tabGroups.onRemoved.addListener(scheduleRefresh);
  browser.tabGroups.onUpdated.addListener(scheduleRefresh);

  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({
      url: browser.runtime.getURL('/dashboard.html'),
    });
  });
});
