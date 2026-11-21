# Operations Runbook

## Health

- API: `GET /health`
- Production startup requires MongoDB connectivity and validated environment variables.

## Reservation Recovery

Expired checkout locks are reconciled every 60 seconds. Reconciliation restores stock for orders still in `PENDING_PAYMENT` and marks the lock released. Check Pino logs for `Reconciled expired inventory locks` and `Expired inventory lock reconciliation failed`.

## Webhooks

Razorpay requests must verify the `x-razorpay-signature` header over the raw request body. Duplicate event IDs are recorded and ignored. If a webhook is delayed or rejected, check API logs and the order status before any manual correction.

## Database

- Catalog: `cityId + status + category`
- Vendor dashboard: `vendorId + status`
- Orders: `renterId + createdAt`, `status + createdAt`, `items.vendorId + status + createdAt`
- Locks: `expiresAt + released`
- Audit: `entityType + entityId + createdAt`

Use MongoDB Atlas continuous backups and run a restore test before launch.
