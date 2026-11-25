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
