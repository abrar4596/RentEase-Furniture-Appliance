/**
 * Payment / ledger constants shared by the API and web clients.
 *
 * Every money movement is recorded as an immutable ledger entry. A successful
 * upfront payment produces one `RENT` and one `DEPOSIT` entry (debiting the
 * renter), while each refund produces a `REFUND` entry (crediting the renter).
 * Keeping the vocabulary in one place keeps the ledger, refunds and reporting in
 * lockstep.
 */

export const LEDGER_ENTRY_TYPES = {
  RENT: 'RENT',
  DEPOSIT: 'DEPOSIT',
  REFUND: 'REFUND',
} as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[keyof typeof LEDGER_ENTRY_TYPES];

export const LEDGER_DIRECTIONS = {
  /** Money collected from the renter (payment in). */
  DEBIT: 'DEBIT',
  /** Money returned to the renter (refund out). */
  CREDIT: 'CREDIT',
} as const;

export type LedgerDirection = (typeof LEDGER_DIRECTIONS)[keyof typeof LEDGER_DIRECTIONS];

export const REFUND_STATUSES = {
  /** Refund requested from the gateway, awaiting its `refund.processed` event. */
  PENDING: 'PENDING',
  /** The gateway confirmed the refund was processed. */
  PROCESSED: 'PROCESSED',
  /** The gateway rejected the refund request. */
  FAILED: 'FAILED',
} as const;

export type RefundStatus = (typeof REFUND_STATUSES)[keyof typeof REFUND_STATUSES];

export const RENTAL_INVOICE_STATUSES = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;

export type RentalInvoiceStatus =
  (typeof RENTAL_INVOICE_STATUSES)[keyof typeof RENTAL_INVOICE_STATUSES];
