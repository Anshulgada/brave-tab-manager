import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const PUBLIC_DIR = new URL('../public/', import.meta.url);
const ICON_SIZES = [16, 32, 48, 128];

describe('extension icons', () => {
  it.each(ICON_SIZES)('ships a %ipx PNG icon', (size) => {
    const bytes = readFileSync(new URL(`icon-${size}.png`, PUBLIC_DIR));

    expect(bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(bytes.byteLength).toBeGreaterThan(64);
  });
});
