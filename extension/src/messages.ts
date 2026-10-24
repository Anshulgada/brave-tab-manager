import { z } from 'zod';

import type { ProviderProfile, ProviderSettings } from './ai';
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
  z.strictObject({
    type: z.literal('library/collect'),
    name: z.string().max(120).optional(),
    collectionId: z.uuid().optional(),
  }),
  z.strictObject({
    type: z.literal('library/restore'),
    collectionId: z.uuid(),
  }),
  z.strictObject({
    type: z.literal('library/organize'),
    mode: z.enum(['provider', 'deterministic']).default('provider'),
  }),
  z.strictObject({
    type: z.literal('library/organize/apply'),
    proposal: z.unknown(),
  }),
  z.strictObject({ type: z.literal('providers/get') }),
  z.strictObject({
    type: z.literal('providers/save'),
    profile: z.unknown(),
  }),
  z.strictObject({ type: z.literal('providers/remove'), id: z.uuid() }),
  z.strictObject({ type: z.literal('providers/activate'), id: z.uuid() }),
  z.strictObject({
    type: z.literal('providers/set-key'),
    key: z.string().min(1).max(4096),
    remember: z.boolean().default(false),
  }),
  z.strictObject({ type: z.literal('providers/forget-key') }),
  z.strictObject({ type: z.literal('providers/grant') }),
]);

export type SwitchboardRequest = z.infer<typeof switchboardRequestSchema>;

export interface OrganizeProposalItem {
  tabId: string;
  title: string;
  url: string;
  hostname: string;
  collectionName: string;
  tags: string[];
}

export interface OrganizeProposal {
  provider: string;
  createdAt: string;
  items: OrganizeProposalItem[];
}

export type SwitchboardResponse =
  | { ok: true; snapshot: SwitchboardSnapshot }
  | {
      ok: true;
      affected: number;
      collectionId?: string;
      collectionName?: string;
      warnings?: string[];
    }
  | { ok: true; proposal: OrganizeProposal }
  | { ok: true; applied: { collections: number; tabs: number } }
  | { ok: true; settings: ProviderSettings; hasKey: boolean }
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

export type { ProviderProfile, ProviderSettings };
