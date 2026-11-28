# Deferred Features & Backlog

This document tracks features that are intentionally deferred or marked out-of-scope for the RentEase v1 MVP according to the Product Requirements Document (`docs/PRD.md`).

## Deferred to Post-MVP (Phase 11+)

1. **Automated Razorpay Subscriptions / Auto-Debit (e-Mandate)**
   - _PRD Section:_ Section 3 (Nice to Have)
   - _Status:_ Deferred
   - _v1 Workaround:_ Manual monthly invoicing and payment links generated 7 days prior to due date; active rental status tracks payment receipts and overdue flags.
   - _Future Design:_ Subscription architecture and webhook handlers structured to accept Razorpay Subscriptions when activated.

2. **Automated Razorpay Route Split Payouts**
   - _PRD Section:_ Section 3 (Nice to Have)
   - _Status:_ Deferred
   - _v1 Workaround:_ Immutable vendor ledger tracking per-order gross rent, platform commission percentage, and net payable. Platform Admins mark batch payouts manually.
   - _Future Design:_ Payment disbursement service abstracts the ledger settlement so Razorpay Route API calls can replace manual batch marking.

3. **Room Combo Bundles**
   - _PRD Section:_ Section 3 (Nice to Have)
   - _Status:_ Deferred
   - _v1 Workaround:_ Single-item catalog browsing and multi-item cart grouping.
   - _Future Design:_ Bundle entity mapping to individual inventory SKUs for atomic reservation.

---

## Deferred Within the Build Plan

1. **Automatic Refund on KYC Rejection**
   - _Phase:_ Deferred from Phase 5 to Phase 6 (order lifecycle completion)
   - _Status:_ Deferred
   - _Current Behaviour:_ A rejected KYC moves the order to `KYC_REJECTED`; the captured upfront rent + security deposit are **not** auto-refunded. An Admin issues the refund explicitly via `POST /api/v1/orders/admin/:id/refund`, which flows through the same verified refund service and append-only payment ledger.
   - _Future Design:_ Wire the KYC rejection transition to `refundService.settleFullRefund` once the Phase 6 lifecycle rules (delivery-slot release, notification stub) are in place.

---

## Explicitly Out of Scope (Do Not Build in v1)

1. **Native iOS & Android Mobile Apps:** Replaced by responsive, mobile-first web app (Next.js App Router + Tailwind).
2. **Second-Hand Buyout / Rent-to-Own Conversions:** Rentals remain pure leases; returns trigger deposit refund or damage deductions.
3. **AI Dynamic Surge Pricing & Automated CIBIL Credit Checks:** Pricing is vendor-configured per tenure tier; lightweight post-checkout 1-step KYC handles verification without external credit bureau APIs.
4. **Cross-City Transfers & Inter-State Relocations:** Hyperlocal only within serviceable Tier-2/Tier-3 city zones.
5. **In-App Live Chat:** Communication handled via structured status transitions, email/notification stubs, and support tickets.
