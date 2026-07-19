import type { SwitchboardSnapshot } from './switchboard';

export type TabAction = 'close' | 'discard';

export type SwitchboardRequest =
  | { type: 'switchboard/get' }
  | { type: 'switchboard/activate'; tabId: number; windowId: number }
  | { type: 'switchboard/action'; action: TabAction; tabIds: number[] }
  | { type: 'switchboard/move'; tabIds: number[]; windowId: number }
  | { type: 'switchboard/group'; tabIds: number[]; title: string }
  | { type: 'switchboard/park'; tabIds: number[]; name: string }
  | { type: 'dashboard/open' };

export type SwitchboardResponse =
  | { ok: true; snapshot: SwitchboardSnapshot }
  | { ok: true; affected: number; warnings?: string[] }
  | { ok: true }
  | { ok: false; error: string };

export interface SwitchboardChangedMessage {
  type: 'switchboard/changed';
}

export function errorResponse(error: unknown): SwitchboardResponse {
  return {
    ok: false,
    error:
      error instanceof Error ? error.message : 'Unexpected extension error',
  };
}
