import { describe, it, expect } from 'vitest';
import {
  isValidPaise,
  assertValidPaise,
  rupeesToPaise,
  paiseToRupees,
  addMoney,
  subtractMoney,
  multiplyMoney,
  calculateCommissionPaise,
  calculateUpfrontDue,
  formatINR,
} from './money.js';

describe('Money Utilities (Zero-Float Integer Paise)', () => {
  describe('isValidPaise & assertValidPaise', () => {
    it('accepts non-negative integers', () => {
      expect(isValidPaise(0)).toBe(true);
      expect(isValidPaise(100)).toBe(true);
      expect(isValidPaise(599900)).toBe(true);
    });

    it('rejects negative numbers, floats, NaN, and non-numbers', () => {
      expect(isValidPaise(-1)).toBe(false);
      expect(isValidPaise(10.5)).toBe(false);
      expect(isValidPaise(NaN)).toBe(false);
      expect(isValidPaise(Infinity)).toBe(false);
      expect(isValidPaise('100')).toBe(false);
      expect(isValidPaise(null)).toBe(false);
      expect(isValidPaise(undefined)).toBe(false);
    });

    it('assertValidPaise throws TypeError on invalid values', () => {
      expect(() => assertValidPaise(-50)).toThrow(TypeError);
      expect(() => assertValidPaise(12.34)).toThrow(TypeError);
      expect(() => assertValidPaise('invalid')).toThrow(TypeError);
      expect(() => assertValidPaise(500)).not.toThrow();
    });
  });

  describe('rupeesToPaise & paiseToRupees conversion', () => {
    it('converts whole rupees to paise', () => {
      expect(rupeesToPaise(100)).toBe(10000);
      expect(rupeesToPaise(0)).toBe(0);
      expect(rupeesToPaise(1499)).toBe(149900);
    });

    it('converts fractional rupees to paise without floating-point drift', () => {
      expect(rupeesToPaise(1499.5)).toBe(149950);
      expect(rupeesToPaise(19.99)).toBe(1999);
      expect(rupeesToPaise(0.01)).toBe(1);
    });

    it('converts paise to rupees accurately', () => {
      expect(paiseToRupees(10000)).toBe(100);
      expect(paiseToRupees(0)).toBe(0);
      expect(paiseToRupees(149950)).toBe(1499.5);
      expect(paiseToRupees(1999)).toBe(19.99);
    });

    it('throws when converting invalid or negative rupees', () => {
      expect(() => rupeesToPaise(-10)).toThrow(TypeError);
      expect(() => rupeesToPaise(NaN)).toThrow(TypeError);
    });
  });

  describe('addMoney', () => {
    it('adds multiple paise amounts', () => {
      expect(addMoney(10000, 20000, 30000)).toBe(60000);
      expect(addMoney(0, 5000)).toBe(5000);
      expect(addMoney()).toBe(0);
    });

    it('throws if any amount is invalid', () => {
      expect(() => addMoney(100, -50)).toThrow(TypeError);
      expect(() => addMoney(100, 25.5)).toThrow(TypeError);
    });
  });

  describe('subtractMoney', () => {
    it('subtracts amounts accurately', () => {
      expect(subtractMoney(50000, 20000)).toBe(30000);
      expect(subtractMoney(50000, 10000, 15000)).toBe(25000);
      expect(subtractMoney(50000, 50000)).toBe(0);
    });

    it('throws RangeError if subtraction results in negative amount', () => {
      expect(() => subtractMoney(1000, 2000)).toThrow(RangeError);
      expect(() => subtractMoney(5000, 3000, 3000)).toThrow(RangeError);
    });
  });

  describe('multiplyMoney', () => {
    it('multiplies integer paise and rounds correctly', () => {
      // 10% commission on ₹1,000 (100000 paise) = ₹100 (10000 paise)
      expect(multiplyMoney(100000, 0.1)).toBe(10000);
      // 15% on 99900 paise = 14985 paise
      expect(multiplyMoney(99900, 0.15)).toBe(14985);
      // Rounding: 1005 * 0.33333333 = 335
      expect(multiplyMoney(1005, 0.33333333)).toBe(335);
    });

    describe('calculateCommissionPaise', () => {
      it('uses integer paise arithmetic for integer commission percentages', () => {
        expect(calculateCommissionPaise(500000, 20)).toBe(100000);
        expect(calculateCommissionPaise(100099, 15)).toBe(15014);
      });

      it('rejects invalid percentages', () => {
        expect(() => calculateCommissionPaise(500000, -1)).toThrow(TypeError);
        expect(() => calculateCommissionPaise(500000, 101)).toThrow(TypeError);
        expect(() => calculateCommissionPaise(500000, 15.5)).toThrow(TypeError);
      });
    });

    it('throws when factor is negative or invalid', () => {
      expect(() => multiplyMoney(10000, -0.5)).toThrow(TypeError);
      expect(() => multiplyMoney(10000, NaN)).toThrow(TypeError);
    });
  });

  describe('calculateUpfrontDue', () => {
    it('computes upfront = firstMonthRent + securityDeposit', () => {
      const rent = 149900; // ₹1,499
      const deposit = 200000; // ₹2,000
      expect(calculateUpfrontDue(rent, deposit)).toBe(349900); // ₹3,499
    });

    it('supports and correctly handles ₹0-deposit deals', () => {
      const rent = 99900; // ₹999
      const zeroDeposit = 0; // ₹0
      expect(calculateUpfrontDue(rent, zeroDeposit)).toBe(99900);
    });

    it('throws if firstMonthRent is zero or negative', () => {
      expect(() => calculateUpfrontDue(0, 200000)).toThrow(RangeError);
      expect(() => calculateUpfrontDue(-1000, 200000)).toThrow(TypeError);
    });

    it('throws if deposit is negative or non-integer', () => {
      expect(() => calculateUpfrontDue(100000, -500)).toThrow(TypeError);
      expect(() => calculateUpfrontDue(100000, 50.5)).toThrow(TypeError);
    });
  });

  describe('formatINR (Indian digit grouping)', () => {
    it('formats small amounts', () => {
      expect(formatINR(0)).toBe('₹0');
      expect(formatINR(50000)).toBe('₹500');
      expect(formatINR(99900)).toBe('₹999');
    });

    it('formats thousands with single comma', () => {
      expect(formatINR(100000)).toBe('₹1,000');
      expect(formatINR(1500000)).toBe('₹15,000');
    });

    it('formats lakhs and crores following Indian numbering system', () => {
      // 1 Lakh = 1,00,000 (10000000 paise)
      expect(formatINR(10000000)).toBe('₹1,00,000');
      // 12 Lakhs 34 Thousand 567 = 12,34,567
      expect(formatINR(123456700)).toBe('₹12,34,567');
      // 1 Crore = 1,00,00,000
      expect(formatINR(1000000000)).toBe('₹1,00,00,000');
    });

    it('formats paise when remainder exists or showPaise is true', () => {
      expect(formatINR(123456750)).toBe('₹12,34,567.50');
      expect(formatINR(100000, { showPaise: true })).toBe('₹1,000.00');
      expect(formatINR(50, { showPaise: true })).toBe('₹0.50');
    });

    it('allows omitting currency symbol', () => {
      expect(formatINR(1500000, { symbol: false })).toBe('15,000');
      expect(formatINR(123456750, { symbol: false })).toBe('12,34,567.50');
    });
  });
});
