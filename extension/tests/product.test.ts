import { describe, expect, it } from 'vitest';

import { PRODUCT_NAME, PRODUCT_SURFACES } from '../src/product';

describe('product scaffold', () => {
  it('exposes the two planned extension surfaces', () => {
    expect(PRODUCT_NAME).toBe('Tabman');
    expect(PRODUCT_SURFACES).toEqual(['switchboard', 'library']);
  });
});
