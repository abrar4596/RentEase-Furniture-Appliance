/**
 * Money utilities for RentEase.
 *
 * INVARIANTS:
 * 1. Zero Float Rule: All monetary amounts must be stored and computed as positive integer paise (1 INR = 100 paise).
 * 2. Floating-point numbers are strictly forbidden for storage, state machine arithmetic, or database models.
 * 3. Indian numbering system formatting: e.g., ₹1,23,456 or ₹1,23,456.50.
 */

export type Paise = number;

/**
 * Validates that a value is a valid non-negative integer number of paise.
 */
export function isValidPaise(value: unknown): value is Paise {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Asserts that a value is a valid non-negative integer number of paise.
 */
export function assertValidPaise(value: unknown, fieldName = 'amount'): asserts value is Paise {
  if (!isValidPaise(value)) {
    throw new TypeError(
      `Invalid money value for ${fieldName}: must be a non-negative integer representing paise. Received: ${String(
        value
      )}`
    );
  }
}

/**
 * Converts a rupee amount (e.g. from user display input) into integer paise.
 * Rounds to nearest integer paise to avoid IEEE-754 floating point precision issues.
 */
export function rupeesToPaise(rupees: number): Paise {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees) || rupees < 0) {
    throw new TypeError(
      `Invalid rupee amount: must be a non-negative finite number. Received: ${rupees}`
    );
  }
  return Math.round(rupees * 100);
}

/**
 * Converts integer paise into floating-point rupees (for UI display or calculations only).
 */
export function paiseToRupees(paise: Paise): number {
  assertValidPaise(paise);
  return paise / 100;
}

/**
 * Adds multiple paise amounts safely.
 */
export function addMoney(...amounts: Paise[]): Paise {
  return amounts.reduce<Paise>((acc, curr, index) => {
    assertValidPaise(curr, `amounts[${index}]`);
    return acc + curr;
  }, 0);
}

/**
 * Subtracts subtrahends from a minuend in integer paise.
 * Throws an error if the result would be negative, ensuring balance integrity.
 */
export function subtractMoney(minuend: Paise, ...subtrahends: Paise[]): Paise {
  assertValidPaise(minuend, 'minuend');
  const totalSubtrahend = addMoney(...subtrahends);
  const result = minuend - totalSubtrahend;
  if (result < 0) {
    throw new RangeError(
      `Subtraction would result in negative balance: minuend=${minuend}, totalSubtrahend=${totalSubtrahend}`
    );
  }
  return result;
}

/**
 * Multiplies an integer paise amount by a factor (e.g. commission rate, discount).
 * Always rounds using Math.round to produce an exact integer paise value.
 */
export function multiplyMoney(amount: Paise, factor: number): Paise {
  assertValidPaise(amount);
  if (typeof factor !== 'number' || !Number.isFinite(factor) || factor < 0) {
    throw new TypeError(
      `Invalid multiplication factor: must be non-negative finite number. Received: ${factor}`
    );
  }
  return Math.round(amount * factor);
}

/**
 * Calculates an integer-paise percentage commission using integer arithmetic.
 * Percentages are integer percentages (for example, 15 means 15%).
 */
export function calculateCommissionPaise(amountPaise: Paise, commissionPercent: number): Paise {
  assertValidPaise(amountPaise);
  if (
    !Number.isSafeInteger(commissionPercent) ||
    commissionPercent < 0 ||
    commissionPercent > 100
  ) {
    throw new TypeError('Commission percent must be an integer between 0 and 100');
  }
  return Math.floor((amountPaise * commissionPercent) / 100);
}

/**
 * Calculates total upfront payment due at checkout:
 * Upfront = First Month Rent + Security Deposit
 * Validates that ₹0 security deposit is supported and valid.
 */
export function calculateUpfrontDue(
  firstMonthRentPaise: Paise,
  securityDepositPaise: Paise
): Paise {
  assertValidPaise(firstMonthRentPaise, 'firstMonthRentPaise');
  assertValidPaise(securityDepositPaise, 'securityDepositPaise');

  if (firstMonthRentPaise <= 0) {
    throw new RangeError(
      `First month rent must be greater than zero. Received: ${firstMonthRentPaise}`
    );
  }

  return addMoney(firstMonthRentPaise, securityDepositPaise);
}

/**
 * Formats integer paise into an Indian Rupee string with the standard Indian digit grouping (lakhs/crores).
 * Example:
 * 100000 paise (₹1000) -> "₹1,000"
 * 12345678 paise (₹1,23,456.78) -> "₹1,23,456.78"
 *
 * @param paise Monetary value in integer paise.
 * @param options.showPaise If true, always formats with 2 decimal places. If false, drops paise if zero.
 * @param options.symbol Whether to prefix with ₹ (default: true).
 */
export function formatINR(
  paise: Paise,
  options: { showPaise?: boolean; symbol?: boolean } = {}
): string {
  assertValidPaise(paise);
  const { showPaise = false, symbol = true } = options;

  const rupeesWhole = Math.floor(paise / 100);
  const paiseRemainder = paise % 100;

  // Format the whole rupees portion using Indian digit grouping
  const wholeString = rupeesWhole.toString();
  let formattedWhole = wholeString;

  if (wholeString.length > 3) {
    const lastThree = wholeString.substring(wholeString.length - 3);
    const otherNumbers = wholeString.substring(0, wholeString.length - 3);
    const withCommas = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedWhole = `${withCommas},${lastThree}`;
  }

  const prefix = symbol ? '₹' : '';

  if (showPaise || paiseRemainder > 0) {
    const paddedPaise = paiseRemainder.toString().padStart(2, '0');
    return `${prefix}${formattedWhole}.${paddedPaise}`;
  }

  return `${prefix}${formattedWhole}`;
}
