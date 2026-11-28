import { Paise, assertValidPaise, calculateUpfrontDue } from './money.js';
import { TenureTier } from '../types/product.js';

/**
 * A fully-resolved pricing quote for one tenure tier.
 *
 * INVARIANTS:
 * - All monetary values are integer paise (Zero Float Rule).
 * - `upfrontDuePaise` is always First Month Rent + Refundable Security Deposit,
 *   so a renter's displayed total always matches the server calculation.
 */
export interface TenureQuote {
  tenureMonths: number;
  monthlyRentPaise: Paise;
  securityDepositPaise: Paise;
  upfrontDuePaise: Paise;
  /** Highest monthly rent across all configured tiers (the shortest-tenure baseline). */
  baselineMonthlyRentPaise: Paise;
  /** Monthly saving versus the baseline tier. */
  savingsPerMonthPaise: Paise;
  /** Total saving over the full tenure versus paying the baseline monthly rent. */
  totalSavingsPaise: Paise;
  /** Integer percentage saved versus the baseline monthly rent. */
  savingsPercent: number;
}

/**
 * Resolves the pricing breakdown for a selected tenure.
 *
 * Savings are measured against the most expensive tier (the short-tenure
 * baseline), which is the standard way renters compare "lock in longer, pay less".
 * A ₹0 security deposit is fully supported.
 */
export function calculateTenureQuote(
  tiers: ReadonlyArray<TenureTier>,
  securityDepositPaise: Paise,
  tenureMonths: number
): TenureQuote {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new RangeError('At least one tenure tier is required to calculate a quote');
  }
  assertValidPaise(securityDepositPaise, 'securityDepositPaise');

  const tier = tiers.find((candidate) => candidate.tenureMonths === tenureMonths);
  if (!tier) {
    throw new RangeError(`No pricing tier configured for a ${tenureMonths}-month tenure`);
  }
  assertValidPaise(tier.monthlyRentPaise, 'monthlyRentPaise');
  if (tier.monthlyRentPaise <= 0) {
    throw new RangeError('Monthly rent must be greater than zero');
  }

  const baselineMonthlyRentPaise = Math.max(
    ...tiers.map((candidate) => candidate.monthlyRentPaise)
  );
  const savingsPerMonthPaise = Math.max(0, baselineMonthlyRentPaise - tier.monthlyRentPaise);
  const totalSavingsPaise = savingsPerMonthPaise * tier.tenureMonths;
  const savingsPercent =
    baselineMonthlyRentPaise > 0
      ? Math.round((savingsPerMonthPaise / baselineMonthlyRentPaise) * 100)
      : 0;

  return {
    tenureMonths: tier.tenureMonths,
    monthlyRentPaise: tier.monthlyRentPaise,
    securityDepositPaise,
    upfrontDuePaise: calculateUpfrontDue(tier.monthlyRentPaise, securityDepositPaise),
    baselineMonthlyRentPaise,
    savingsPerMonthPaise,
    totalSavingsPaise,
    savingsPercent,
  };
}
