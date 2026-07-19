import { z } from 'zod';

const uuid = z.uuid();
const timestamp = z.iso.datetime({ offset: true });
const shortName = z.string().min(1).max(64);
const collectionName = z.string().min(1).max(120);
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const allowedSchemes = new Set([
  'http:',
  'https:',
  'chrome:',
  'chrome-extension:',
  'brave:',
  'edge:',
  'about:',
]);

const address = z
  .string()
  .min(1)
  .max(8192)
  .superRefine((value, context) => {
    try {
      const parsed = new URL(value);
      if (!allowedSchemes.has(parsed.protocol)) {
        context.addIssue({
          code: 'custom',
          message: 'URL scheme is not allowed',
        });
        return;
      }
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        !parsed.hostname
      ) {
        context.addIssue({
          code: 'custom',
          message: 'HTTP URL must include a hostname',
        });
        return;
      }
      if (parsed.username || parsed.password) {
        context.addIssue({
          code: 'custom',
          message: 'URL must not include credentials',
        });
      }
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'URL must be absolute',
      });
    }
  });

export const tagSchema = z.strictObject({
  id: uuid,
  name: shortName,
  color: color.nullable().optional(),
});

export const tabSchema = z
  .strictObject({
    id: uuid,
    title: z.string().max(2048),
    url: address,
    hostname: z.string().max(253),
    favIconUrl: address.nullable().optional(),
    pinned: z.boolean(),
    position: z.int().nonnegative(),
    createdAt: timestamp,
    lastAccessedAt: timestamp.nullable(),
    tagIds: z.array(uuid).refine((ids) => new Set(ids).size === ids.length, {
      message: 'tagIds must be unique',
    }),
  })
  .superRefine((tab, context) => {
    try {
      const parsed = new URL(tab.url);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        tab.hostname.toLowerCase() !== parsed.hostname.toLowerCase()
      ) {
        context.addIssue({
          code: 'custom',
          message: 'hostname must match the URL host',
          path: ['hostname'],
        });
      }
    } catch {
      // Absolute URL validation already reported on `url`.
    }
  });

export const collectionSchema = z
  .strictObject({
    id: uuid,
    name: collectionName,
    description: z.string().max(4096).nullable(),
    color: color.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
    status: z.enum(['active', 'trashed']),
    tags: z.array(tagSchema),
    tabs: z.array(tabSchema),
  })
  .superRefine((collection, context) => {
    const tagIds = new Set(collection.tags.map((tag) => tag.id));
    if (tagIds.size !== collection.tags.length) {
      context.addIssue({
        code: 'custom',
        message: 'collection tag IDs must be unique',
        path: ['tags'],
      });
    }
    const tabIds = new Set(collection.tabs.map((tab) => tab.id));
    if (tabIds.size !== collection.tabs.length) {
      context.addIssue({
        code: 'custom',
        message: 'collection tab IDs must be unique',
        path: ['tabs'],
      });
    }
    for (const [index, tab] of collection.tabs.entries()) {
      if (tab.tagIds.some((tagId) => !tagIds.has(tagId))) {
        context.addIssue({
          code: 'custom',
          message: 'tab references a tag outside its collection',
          path: ['tabs', index, 'tagIds'],
        });
      }
    }
  });

export const sessionSchema = z
  .strictObject({
    id: uuid,
    name: collectionName,
    capturedAt: timestamp,
    browser: shortName,
    windowCount: z.int().nonnegative(),
    tabs: z.array(tabSchema),
  })
  .superRefine((session, context) => {
    if (
      new Set(session.tabs.map((tab) => tab.id)).size !== session.tabs.length
    ) {
      context.addIssue({
        code: 'custom',
        message: 'session tab IDs must be unique',
        path: ['tabs'],
      });
    }
    for (const [index, tab] of session.tabs.entries()) {
      if (tab.tagIds.length > 0) {
        context.addIssue({
          code: 'custom',
          message: 'session tabs cannot reference collection tags',
          path: ['tabs', index, 'tagIds'],
        });
      }
    }
  });

export const proposalItemSchema = z.strictObject({
  tabId: uuid,
  collectionName,
  tags: z.array(shortName).max(12),
});

export const proposalSchema = z
  .strictObject({
    id: uuid,
    createdAt: timestamp,
    provider: shortName,
    status: z.enum(['preview', 'applied', 'rejected']),
    items: z.array(proposalItemSchema),
  })
  .refine(
    (proposal) =>
      new Set(proposal.items.map((item) => item.tabId)).size ===
      proposal.items.length,
    { message: 'a proposal may map each tab only once', path: ['items'] },
  );

export const settingsSchema = z.strictObject({
  theme: z.enum(['system', 'light', 'dark']),
  defaultView: z.enum(['list', 'grid']),
  includeFullUrlInAi: z.boolean(),
  aiProvider: shortName.nullable(),
});

export const exportDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    exportedAt: timestamp,
    collections: z.array(collectionSchema),
    sessions: z.array(sessionSchema),
    proposals: z.array(proposalSchema),
    settings: settingsSchema,
  })
  .superRefine((document, context) => {
    for (const [field, records] of [
      ['collections', document.collections],
      ['sessions', document.sessions],
      ['proposals', document.proposals],
    ] as const) {
      if (new Set(records.map((record) => record.id)).size !== records.length) {
        context.addIssue({
          code: 'custom',
          message: `${field} IDs must be unique`,
          path: [field],
        });
      }
    }
    const tabIds = [
      ...document.collections.flatMap((collection) =>
        collection.tabs.map((tab) => tab.id),
      ),
      ...document.sessions.flatMap((session) =>
        session.tabs.map((tab) => tab.id),
      ),
    ];
    if (new Set(tabIds).size !== tabIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'tab IDs must be unique across the document',
        path: ['collections'],
      });
    }
    const tagIds = document.collections.flatMap((collection) =>
      collection.tags.map((tag) => tag.id),
    );
    if (new Set(tagIds).size !== tagIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'tag IDs must be unique across the document',
        path: ['collections'],
      });
    }
  });

export type Tag = z.infer<typeof tagSchema>;
export type Tab = z.infer<typeof tabSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type ExportDocument = z.infer<typeof exportDocumentSchema>;

export function parseExportDocument(input: unknown): ExportDocument {
  return exportDocumentSchema.parse(input);
}
