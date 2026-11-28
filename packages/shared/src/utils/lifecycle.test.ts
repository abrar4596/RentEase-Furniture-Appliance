import { describe, expect, it } from 'vitest';
import { calculateDepositSettlement } from './lifecycle.js';

describe('calculateDepositSettlement', () => {
  it('supports full refund, partial deduction, and full forfeiture', () => {
    expect(calculateDepositSettlement(100000, 0)).toEqual({
      refundPaise: 100000,
      forfeitedPaise: 0,
    });
    expect(calculateDepositSettlement(100000, 25000)).toEqual({
      refundPaise: 75000,
      forfeitedPaise: 25000,
    });
    expect(calculateDepositSettlement(100000, 100000)).toEqual({
      refundPaise: 0,
      forfeitedPaise: 100000,
    });
  });

  it('never deducts beyond the deposit', () => {
    expect(calculateDepositSettlement(10000, 99999)).toEqual({
      refundPaise: 0,
      forfeitedPaise: 10000,
    });
  });
});
