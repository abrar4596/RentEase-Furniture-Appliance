# Operations Runbook

## Health

- API: `GET /health`
- Production startup requires MongoDB connectivity and validated environment variables.
- A disconnected database returns HTTP 503 with `status: DEGRADED`.

## Reservation Recovery

Expired checkout locks are reconciled every 60 seconds. Reconciliation restores stock for orders still in `PENDING_PAYMENT` and marks the lock released. Check Pino logs for `Reconciled expired inventory locks` and `Expired inventory lock reconciliation failed`.

## Webhooks

Razorpay requests must verify the `x-razorpay-signature` header over the raw request body. Composite event keys (`event:event-entity-id`) are recorded and ignored on replay. If a webhook is delayed or rejected, check API logs and the order status before any manual correction.

## Razorpay Test-Mode Run

Use Razorpay **test mode** credentials to exercise the full checkout, settlement, refund, and webhook flow without moving real money.

1. **Keys.** Generate a Test Key ID / Key Secret from the Razorpay dashboard (Settings → API Keys) and set them on the API service: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. When these hold real test values the gateway makes live Razorpay API calls; when left at the `rzp_test_placeholder_*` defaults, outbound order/refund calls are stubbed while signature verification stays real.
2. **Checkout.** Sign in as a renter, add an item to the cart, and complete checkout. Razorpay's hosted Checkout opens with the server-issued `keyId`; pay with a test method (for example test UPI or card `4111 1111 1111 1111`). The signature is verified server-side and the order moves to `PENDING_KYC`.
3. **Webhook.** In the Razorpay dashboard add a webhook for `payment.captured`, `payment.failed`, and `refund.processed` pointing at `https://<api-host>/api/v1/payments/webhook`, then copy its signing secret into `RAZORPAY_WEBHOOK_SECRET`. Events are verified over the raw body and de-duplicated by event ID.
4. **Refund.** As an Admin, call `POST /api/v1/orders/admin/:id/refund` (omit `amountPaise` for a full refund, or supply a partial amount) and confirm the refund record plus the appended ledger entry via `GET /api/v1/orders/admin/:id/payments`.
5. **Automated coverage.** `npm run test --workspace=@rentease/api` runs `tests/phase5.test.ts`, which exercises signature failure, duplicate webhooks, amount tampering, payment failure releasing stock, and late webhooks after cancellation using the stubbed gateway with real HMAC signatures.

## Database

- Catalog: `cityId + status + category`
- Vendor dashboard: `vendorId + status`
- Orders: `renterId + createdAt`, `status + createdAt`, `items.vendorId + status + createdAt`
- Locks: `expiresAt + released`
- Audit: `entityType + entityId + createdAt`

Use MongoDB Atlas continuous backups and run a restore test before launch.

## Render Deployment

Set the API service's root directory to the repository root so npm can access the root lockfile and workspaces.

- Build command: `npm ci --include=dev && npm run build --workspace=@rentease/api`
- Start command: `npm run start --workspace=@rentease/api`

The API build script builds `@rentease/shared` before compiling the API. Keep the TypeScript and `@types/*` development dependencies installed during the build; `--include=dev` ensures this even if `NODE_ENV=production` is configured for the service. Add the required production API variables in Render's environment settings.

## Vercel Frontend Deployment

Create a separate Vercel project for the web app with these settings:

- Framework preset: **Next.js**
- Root Directory: `apps/web`
- Enable **Include source files outside of the Root Directory in the Build Step** so the workspace package is available.
- Install Command: `cd ../.. && npm ci --include=dev`
- Build Command: `cd ../.. && npm run build --workspace=@rentease/web`

The web workspace's `prebuild` script compiles `@rentease/shared` before `next build`. The Next.js config also lists the workspace package in `transpilePackages` for Turbopack.
