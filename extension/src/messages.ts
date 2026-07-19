import { z } from 'zod';

import type { SwitchboardSnapshot } from './switchboard';

export type TabAction = 'close' | 'discard';

const tabActionSchema = z.enum(['close', 'discard']);
const positiveInt = z.number().int().positive();

export const switchboardRequestSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('switchboard/get') }),
  z.strictObject({
    type: z.literal('switchboard/activate'),
    tabId: positiveInt,
    windowId: positiveInt,
  }),
  z.strictObject({
    type: z.literal('switchboard/action'),
    action: tabActionSchema,
    tabIds: z.array(positiveInt).min(1),
  }),
  z.strictObject({
    type: z.literal('switchboard/move'),
    tabIds: z.array(positiveInt).min(1),
    windowId: positiveInt,
  }),
  z.strictObject({
    type: z.literal('switchboard/group'),
    tabIds: z.array(positiveInt).min(1),
    title: z.string().max(64),
  }),
  z.strictObject({
    type: z.literal('switchboard/park'),
    tabIds: z.array(positiveInt).min(1),
    name: z.string().max(120),
  }),
  z.strictObject({ type: z.literal('dashboard/open') }),
]);

export type SwitchboardRequest = z.infer<typeof switchboardRequestSchema>;

export type SwitchboardResponse =
  | { ok: true; snapshot: SwitchboardSnapshot }
  | { ok: true; affected: number; warnings?: string[] }
  | { ok: true }
  | { ok: false; error: string };

export interface SwitchboardChangedMessage {
  type: 'switchboard/changed';
}

export interface LibraryChangedMessage {
  type: 'library/changed';
}

export function parseSwitchboardRequest(input: unknown): SwitchboardRequest {
  return switchboardRequestSchema.parse(input);
}

export function errorResponse(error: unknown): SwitchboardResponse {
  return {
    ok: false,
    error:
      error instanceof Error ? error.message : 'Unexpected extension error',
  };
}
