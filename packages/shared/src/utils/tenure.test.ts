import { describe, it, expect } from 'vitest';
import { calculateTenureQuote } from './tenure.js';
import { TenureTier } from '../types/product.js';

const tiers: TenureTier[] = [
  { tenureMonths: 1, monthlyRentPaise: 149900 },
  { tenureMonths: 3, monthlyRentPaise: 129900 },
  { tenureMonths: 6, monthlyRentPaise: 109900 },
  { tenureMonths: 12, monthlyRentPaise: 89900 },
];

describe('calculateTenureQuote (Dynamic Tenure Calculator)', () => {
  it('resolves monthly rent and upfront due for every tier', () => {
    expect(calculateTenureQuote(tiers, 500000, 1)).toMatchObject({
      monthlyRentPaise: 149900,
      upfrontDuePaise: 649900,
    });
    expect(calculateTenureQuote(tiers, 500000, 3)).toMatchObject({
      monthlyRentPaise: 129900,
      upfrontDuePaise: 629900,
    });
    expect(calculateTenureQuote(tiers, 500000, 6)).toMatchObject({
      monthlyRentPaise: 109900,
      upfrontDuePaise: 609900,
    });
    expect(calculateTenureQuote(tiers, 500000, 12)).toMatchObject({
      monthlyRentPaise: 89900,
      upfrontDuePaise: 589900,
    });
  });

  it('supports the ₹0 deposit edge case (upfront equals first month rent)', () => {
    const quote = calculateTenureQuote(tiers, 0, 6);
    expect(quote.securityDepositPaise).toBe(0);
    expect(quote.upfrontDuePaise).toBe(109900);
  });

  it('measures savings against the highest (short-tenure) tier', () => {
    const quote = calculateTenureQuote(tiers, 0, 12);
    expect(quote.baselineMonthlyRentPaise).toBe(149900);
    expect(quote.savingsPerMonthPaise).toBe(60000);
    expect(quote.totalSavingsPaise).toBe(60000 * 12);
    expect(quote.savingsPercent).toBe(40);
  });

  it('reports zero savings for the baseline tier itself', () => {
    const quote = calculateTenureQuote(tiers, 100000, 1);
    expect(quote.savingsPerMonthPaise).toBe(0);
    expect(quote.totalSavingsPaise).toBe(0);
    expect(quote.savingsPercent).toBe(0);
  });

  it('keeps every monetary output as an integer (Zero Float Rule)', () => {
    const quote = calculateTenureQuote(tiers, 33333, 3);
    for (const value of [
      quote.monthlyRentPaise,
      quote.securityDepositPaise,
      quote.upfrontDuePaise,
      quote.baselineMonthlyRentPaise,
      quote.savingsPerMonthPaise,
      quote.totalSavingsPaise,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('throws for an unconfigured tenure or empty tier list', () => {
    expect(() => calculateTenureQuote(tiers, 0, 2)).toThrow(/No pricing tier/);
    expect(() => calculateTenureQuote([], 0, 1)).toThrow(/At least one tenure tier/);
  });
});
