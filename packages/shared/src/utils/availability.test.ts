import { describe, it, expect } from 'vitest';
import { deriveAvailability, availabilityLabel } from './availability.js';
import { PRODUCT_AVAILABILITIES } from '../constants/catalog.js';

describe('deriveAvailability (stock internals stay private)', () => {
  it('maps zero and negative stock to unavailable', () => {
    expect(deriveAvailability(0)).toBe(PRODUCT_AVAILABILITIES.UNAVAILABLE);
    expect(deriveAvailability(-5)).toBe(PRODUCT_AVAILABILITIES.UNAVAILABLE);
  });

  it('maps a small remaining stock to limited', () => {
    expect(deriveAvailability(1)).toBe(PRODUCT_AVAILABILITIES.LIMITED);
    expect(deriveAvailability(3)).toBe(PRODUCT_AVAILABILITIES.LIMITED);
  });

  it('maps healthy stock to in_stock', () => {
    expect(deriveAvailability(4)).toBe(PRODUCT_AVAILABILITIES.IN_STOCK);
    expect(deriveAvailability(250)).toBe(PRODUCT_AVAILABILITIES.IN_STOCK);
  });

  it('never returns a raw number and always returns a known bucket', () => {
    const buckets = Object.values(PRODUCT_AVAILABILITIES) as string[];
    for (const stock of [0, 1, 3, 4, 99]) {
      const result = deriveAvailability(stock);
      expect(typeof result).toBe('string');
      expect(buckets).toContain(result);
    }
  });
});

describe('availabilityLabel', () => {
  it('returns human-readable labels for each bucket', () => {
    expect(availabilityLabel(PRODUCT_AVAILABILITIES.IN_STOCK)).toBe('In stock');
    expect(availabilityLabel(PRODUCT_AVAILABILITIES.LIMITED)).toBe('Limited stock');
    expect(availabilityLabel(PRODUCT_AVAILABILITIES.UNAVAILABLE)).toBe('Out of stock');
  });
});
