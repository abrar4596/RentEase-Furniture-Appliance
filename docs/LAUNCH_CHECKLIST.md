# RentEase Launch Checklist

## Pre-Deployment

- [ ] Set production secrets in the hosting provider; never commit `.env`.
- [ ] Configure MongoDB Atlas backups, IP allowlist, and least-privilege database users.
- [ ] Set `NODE_ENV=production`, production CORS origin, JWT secrets, and secure cookie domain.
- [ ] Configure Razorpay live keys and webhook secret; register only `/api/v1/payments/webhook`.
- [ ] Configure Cloudinary signed uploads and authenticated/private KYC delivery.
- [ ] Verify KYC documents are masked in API responses and retained according to the PII retention policy.
- [ ] Confirm production commission, KYC window, and reservation TTL settings.
- [ ] Run database index creation and inspect catalog/order queries with `explain`.

## Release

- [ ] Run formatting, lint, type-check, tests, and builds in CI.
- [ ] Run the three critical journeys against a staging environment.
- [ ] Verify health endpoint and process restart behavior.
- [ ] Confirm expired reservation reconciliation logs and stock restoration.
- [ ] Verify duplicate payment webhooks are idempotent.
- [ ] Review `/admin/audit` after vendor, KYC, payout, city, settings, and damage actions.

## Operations

- [ ] Configure uptime checks for `/health` and alert on degraded MongoDB status.
- [ ] Export structured Pino logs to the provider's log service.
- [ ] Configure a backup restore drill and rollback release.
- [ ] Keep automated subscriptions, Razorpay Route payouts, and combo bundles deferred.
- [ ] Reassess the deferred Vitest/Vite development advisory during the next dependency-maintenance window.

## PII Retention

KYC ID numbers must not be returned in full by API models. Reviews must use the authorized admin queue. MongoDB Atlas encryption at rest and hosting-provider disk encryption are required. Define the final destruction period with compliance operations before production launch and restrict database exports to authorized backups.
