import { Paise } from './money.js';

export function calculateDepositSettlement(
  depositPaise: Paise,
  deductionPaise: Paise
): { refundPaise: Paise; forfeitedPaise: Paise } {
  const deposit = Math.max(0, depositPaise);
  const deduction = Math.min(Math.max(0, deductionPaise), deposit);
  return {
    refundPaise: deposit - deduction,
    forfeitedPaise: deduction,
  };
}
