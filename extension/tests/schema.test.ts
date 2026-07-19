import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { exportDocumentSchema, parseExportDocument } from '../src/schema';

const fixtureUrl = new URL(
  '../../packages/schema/fixtures/collection.v1.json',
  import.meta.url,
);

function loadFixture(): unknown {
  return JSON.parse(readFileSync(fixtureUrl, 'utf8'));
}

describe('shared export contract', () => {
  it('imports and round-trips the shared fixture', () => {
    const document = parseExportDocument(loadFixture());
    const exported = JSON.parse(JSON.stringify(document));

    expect(exportDocumentSchema.parse(exported)).toEqual(document);
    expect(document.schemaVersion).toBe(1);
    expect(document.collections[0]?.tabs[0]?.hostname).toBe(
      'developer.chrome.com',
    );
  });

  it('rejects unknown fields', () => {
    const fixture = loadFixture() as Record<string, unknown>;
    fixture.unexpected = true;

    expect(exportDocumentSchema.safeParse(fixture).success).toBe(false);
  });

  it('rejects dangling tag references', () => {
    const fixture = loadFixture() as {
      collections: Array<{ tabs: Array<{ tagIds: string[] }> }>;
    };
    const firstTab = fixture.collections[0]?.tabs[0];
    expect(firstTab).toBeDefined();
    if (firstTab) {
      firstTab.tagIds = ['90000000-0000-4000-8000-000000000001'];
    }

    expect(exportDocumentSchema.safeParse(fixture).success).toBe(false);
  });
});
