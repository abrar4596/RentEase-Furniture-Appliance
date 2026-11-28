# RentEase

> Hyperlocal, multi-vendor furniture & appliance rental platform for Tier-2 and Tier-3 Indian cities.

RentEase connects local furniture and appliance dealers directly with relocating students, early-career working professionals, and temporary residents. By utilizing existing idle retail inventory, RentEase unlocks rapid 24–48 hour doorstep delivery, flexible short-term tenures (1, 3, 6, 12 months), and low upfront deposits without capital-intensive centralized warehouses.

---

## Architecture Overview

RentEase is structured as a TypeScript monorepo using npm workspaces:

```text
rentease/
├── apps/
│   ├── api/          # Express.js REST API with TypeScript & MongoDB
│   └── web/          # Next.js (App Router), React, Tailwind CSS
├── packages/
│   └── shared/       # Shared TypeScript types, Zod schemas, roles, money utility
├── docs/
│   ├── PRD.md        # Product Requirements Document (Source of Truth)
│   └── DEFERRED.md   # Explicitly deferred and post-MVP backlog tracking
└── .github/
    └── workflows/    # CI quality gates (lint, type-check, test, build)
```

### Backend Layering

```text
Routes → Middleware (Auth/RBAC/Validation) → Controllers → Services → Repositories / Models
```

- **Controllers** stay thin and delegate immediately to services.
- **Services** encapsulate all business logic, money calculations, and state machine transitions.
- **Repositories / Models** handle atomic MongoDB operations with strict indexing.
- **Centralized Error Handling:** Standard response envelope across all endpoints:
  - Success: `{ "success": true, "data": ... }`
  - Error: `{ "success": false, "error": { "code": "...", "message": "...", "details": ... } }`

---

## Tech Stack

- **Frontend:** Next.js 14/15 (App Router), React 18/19, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express.js, TypeScript, Mongoose (MongoDB ODM)
- **Shared:** Zod schemas, integer paise money arithmetic, state machine definitions
- **Authentication:** Custom JWT (short-lived access token + rotating refresh token) & Google OAuth 2.0
- **Storage & Media:** Cloudinary (signed uploads, private/authenticated KYC folder)
- **Payments:** Razorpay (UPI, Cards, Netbanking; signatures verified server-side)

---

## Getting Started

### Prerequisites

- Node.js >= 20.x (tested on v24.x)
- npm >= 10.x (tested on v11.x)
- MongoDB instance (local or MongoDB Atlas connection string)

### Installation

1. Clone the repository and navigate into the project directory:

   ```bash
   cd "RentEase–Furniture & Appliance Rental Platform"
   ```

2. Install all dependencies across the monorepo:

   ```bash
   npm install
   ```

3. Configure environment variables:
   ```bash
   cp .env.example apps/api/.env
   cp .env.example apps/web/.env.local
   ```
   _Edit the `.env` files with your local MongoDB URI and development keys._

---

## Development Scripts

Run scripts from the monorepo root:

| Command                | Action                                                                    |
| :--------------------- | :------------------------------------------------------------------------ |
| `npm run dev`          | Start both API (`localhost:5000`) and Web (`localhost:3000`) concurrently |
| `npm run build`        | Build all packages and applications (`shared`, `api`, `web`)              |
| `npm test`             | Run all test suites across the monorepo                                   |
| `npm run lint`         | Run ESLint across all workspaces                                          |
| `npm run type-check`   | Run `tsc --noEmit` across all workspaces                                  |
| `npm run format`       | Auto-format files with Prettier                                           |
| `npm run format:check` | Verify formatting conformance with Prettier                               |

---

## API Reference

### Health & Monitoring

| Method | Endpoint         | Auth   | Description                               | Response Envelope                                                  |
| :----- | :--------------- | :----- | :---------------------------------------- | :----------------------------------------------------------------- |
| `GET`  | `/health`        | Public | System uptime & MongoDB connection status | `{ success: true, data: { status: "OK", timestamp, uptime, db } }` |
| `GET`  | `/api/v1/health` | Public | Versioned health check                    | `{ success: true, data: { status: "OK", timestamp, uptime, db } }` |

### Authentication & RBAC (Phase 1)

| Method | Endpoint                       | Auth          | Description                                                        | Body / Payload                                                   |
| :----- | :----------------------------- | :------------ | :----------------------------------------------------------------- | :--------------------------------------------------------------- |
| `POST` | `/api/v1/auth/register`        | Public        | Register new Renter or Local Vendor                                | `{ email, password, name, phone?, role?: "renter" \| "vendor" }` |
| `POST` | `/api/v1/auth/login`           | Public        | Authenticate user & receive access token + httpOnly refresh cookie | `{ email, password }`                                            |
| `POST` | `/api/v1/auth/refresh`         | Public        | Rotate refresh token & receive new access token                    | Cookie: `refreshToken`                                           |
| `POST` | `/api/v1/auth/logout`          | Public        | Revoke current refresh token & clear cookie                        | Cookie: `refreshToken`                                           |
| `POST` | `/api/v1/auth/logout-all`      | Authenticated | Revoke all active sessions across all devices                      | Header: `Authorization: Bearer <token>`                          |
| `GET`  | `/api/v1/auth/me`              | Authenticated | Retrieve current user profile                                      | Header: `Authorization: Bearer <token>`                          |
| `POST` | `/api/v1/auth/forgot-password` | Public        | Request password reset token                                       | `{ email }`                                                      |
| `POST` | `/api/v1/auth/reset-password`  | Public        | Reset password using valid token                                   | `{ token, newPassword }`                                         |
| `POST` | `/api/v1/auth/google`          | Public        | Google OAuth 2.0 exchange & login/link                             | `{ credential }`                                                 |

### Cities & Service Zones (Phase 2)

| Method | Endpoint         | Auth   | Description                                              | Response Envelope                            |
| :----- | :--------------- | :----- | :------------------------------------------------------- | :------------------------------------------- |
| `GET`  | `/api/v1/cities` | Public | List active launch cities with serviced 6-digit pincodes | `{ success: true, data: { cities: [...] } }` |

### Vendor Onboarding & Verification (Phase 2)

| Method  | Endpoint                           | Auth   | Description                                           | Body / Payload                                            |
| :------ | :--------------------------------- | :----- | :---------------------------------------------------- | :-------------------------------------------------------- |
| `GET`   | `/api/v1/vendors/me`               | Vendor | Get authenticated vendor's store profile and status   | Header: `Authorization: Bearer <token>`                   |
| `POST`  | `/api/v1/vendors/profile`          | Vendor | Register initial store profile, city, and pincodes    | `{ businessName, contactPhone, cityId, servicePincodes }` |
| `PATCH` | `/api/v1/vendors/profile`          | Vendor | Update store contact details or service pincodes      | `{ businessName?, contactPhone?, servicePincodes? }`      |
| `GET`   | `/api/v1/vendors/admin/all`        | Admin  | List all vendor registrations for verification review | Header: `Authorization: Bearer <admin_token>`             |
| `PATCH` | `/api/v1/vendors/admin/:id/verify` | Admin  | Approve or reject vendor store verification           | `{ status: "APPROVED" \| "REJECTED", rejectionReason? }`  |
| `PATCH` | `/api/v1/vendors/admin/:id/commission` | Admin | Set a vendor-specific commission override (0-100 percent) | `{ commissionPercent: number }` |

### Inventory & Product Management (Phase 2)

| Method   | Endpoint                       | Auth            | Description                                            | Body / Payload                                                                                           |
| :------- | :----------------------------- | :-------------- | :----------------------------------------------------- | :------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/v1/products`             | Vendor          | Create product listing (draft mode if unverified)      | `{ title, category, subcategory, tenureTiers, stock, ... }`                                              |
| `GET`    | `/api/v1/products/vendor/mine` | Vendor          | Get all products owned by current authenticated vendor | Header: `Authorization: Bearer <token>`                                                                  |
| `GET`    | `/api/v1/products/:id`         | Public          | Get full product details and tenure tiers              | Params: `id`                                                                                             |
| `PATCH`  | `/api/v1/products/:id`         | Vendor          | Update product details, specs, and pricing tiers       | `{ title?, description?, tenureTiers?, ... }`                                                            |
| `PATCH`  | `/api/v1/products/:id/stock`   | Vendor          | Atomically update available stock count                | `{ stockCount: number }`                                                                                 |
| `PATCH`  | `/api/v1/products/:id/status`  | Vendor          | Update listing status (`active`, `draft`, `paused`)    | `{ status: "active" \| "draft" \| "paused" }`                                                            |
| `DELETE` | `/api/v1/products/:id`         | Vendor          | Delete listing (guarded by vendor ownership)           | Params: `id`                                                                                             |
| `POST`   | `/api/v1/uploads/signature`    | Vendor / Renter | Generate scoped signed Cloudinary upload params        | Body: `{ folder: "products" \| "kyc" \| "maintenance" }` (`products` → Vendor only, `kyc` → Renter only) |

---

### City-Aware Catalog & Tenure Calculator (Phase 3)

| Method | Endpoint                        | Auth   | Description                                                                     | Query / Body                                                                                                                                                  |
| :----- | :------------------------------ | :----- | :------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/catalog`               | Public | Server-rendered, indexed catalog search with filters, sorting, and pagination   | Query: `cityId`, `pincode`, `category`, `subcategory`, `search`, `minPricePaise`, `maxPricePaise`, `zeroDepositOnly`, `availability`, `sort`, `page`, `limit` |
| `GET`  | `/api/v1/cities/serviceability` | Public | Resolve delivery serviceability by pincode (definitive) or city id (city-level) | Query: `pincode` **or** `cityId` → `{ serviceable, city, requestedPincode? }`                                                                                 |
| `POST` | `/api/v1/cities/waitlist`       | Public | Capture interest for a not-yet-serviceable city (idempotent per city + contact) | `{ cityName, pincode?, name?, email?, phone? }` (at least one of `email` / `phone`)                                                                           |

> **Availability privacy:** public catalog and product responses expose only the derived `availability` bucket (`in_stock` / `limited` / `unavailable`); raw vendor `stockCount` is never returned. The catalog sort key is the denormalized `startingRentPaise`; `GET /api/v1/products/:id` returns the same renter-safe projection.

---

### Cart & Checkout (Phase 4)

| Method           | Endpoint                           | Auth   | Description                                                                  |
| :--------------- | :--------------------------------- | :----- | :--------------------------------------------------------------------------- |
| `GET`            | `/api/v1/cart`                     | Renter | Get the authenticated user's cart                                            |
| `POST`           | `/api/v1/cart/items`               | Renter | Add a product and tenure tier to the cart                                    |
| `PATCH`          | `/api/v1/cart/items/:productId`    | Renter | Update cart quantity or tenure                                               |
| `DELETE`         | `/api/v1/cart/items/:productId`    | Renter | Remove a cart item                                                           |
| `POST`           | `/api/v1/orders/checkout`          | Renter | Validate stock, lock inventory, and create an order/payment request          |
| `POST`           | `/api/v1/payments/verify`          | Renter | Verify a Razorpay signature and move the order to Pending KYC                |
| `POST`           | `/api/v1/payments/webhook`         | Public | Process signed Razorpay webhook events                                       |
| `GET`            | `/api/v1/orders`                   | Renter | List the renter's orders                                                     |
| `POST`           | `/api/v1/orders/:id/kyc`           | Renter | Submit government ID details and Cloudinary document URLs                    |
| `GET`            | `/api/v1/orders/admin/kyc`         | Admin  | List orders with submitted KYC pending review                                |
| `PATCH`          | `/api/v1/orders/admin/:id/kyc`     | Admin  | Approve or reject submitted renter KYC                                       |
| `GET`            | `/api/v1/orders/vendor/mine`       | Vendor | List confirmed and active fulfillment orders                                 |
| `PATCH`          | `/api/v1/orders/vendor/:id/status` | Vendor | Move owned orders from Confirmed to Out for Delivery or Active               |
| `POST`           | `/api/v1/orders/:id/maintenance`   | Renter | Create a maintenance request for an active rental                            |
| `POST`           | `/api/v1/orders/:id/extend`        | Renter | Extend an active rental tenure                                               |
| `POST`           | `/api/v1/orders/:id/return`        | Renter | Request pickup for an active rental                                          |
| `PATCH`          | `/api/v1/orders/vendor/:id/return` | Vendor | Complete a return and optionally record damage deductions                    |
| `GET`            | `/api/v1/payouts/ledger`           | Vendor | View immutable per-order ledger entries and pending/paid totals              |
| `GET`            | `/api/v1/payouts/admin/ledger`     | Admin  | View all vendor payout ledger entries                                        |
| `PATCH`          | `/api/v1/payouts/admin/pay`        | Admin  | Mark selected pending entries for one vendor as paid                         |
| `GET`            | `/api/v1/admin/metrics`            | Admin  | Read PRD success metrics computed from real orders, rentals, and maintenance |
| `GET`            | `/api/v1/admin/orders`             | Admin  | Search orders and inspect damage claims                                      |
| `GET`            | `/api/v1/admin/audit`              | Admin  | Review append-only admin audit events                                        |
| `PATCH`          | `/api/v1/admin/orders/:id/damage`  | Admin  | Approve, adjust, or dismiss a damage claim                                   |
| `GET/PATCH`      | `/api/v1/admin/settings`           | Admin  | Read or update commission, KYC window, and reservation TTL                   |
| `GET/POST/PATCH` | `/api/v1/admin/cities`             | Admin  | List, create, activate, or deactivate service cities                         |
| `POST`           | `/api/v1/orders/:id/cancel`        | Renter | Cancel a pending order and release inventory                                 |

### Payments, Refunds & Ledger (Phase 5)

| Method | Endpoint                            | Auth   | Description                                                          |
| :----- | :---------------------------------- | :----- | :------------------------------------------------------------------- |
| `POST` | `/api/v1/orders/:id/pay`            | Renter | Resume payment for a saved pending order (reuses the Razorpay order) |
| `POST` | `/api/v1/orders/admin/:id/refund`   | Admin  | Issue a full or partial refund against the upfront rent + deposit    |
| `GET`  | `/api/v1/orders/admin/:id/payments` | Admin  | Read an order's immutable payment ledger entries and refund records  |

> **Exactly-once settlement:** the client verification (`POST /api/v1/payments/verify`) and the Razorpay webhook share one atomic `PENDING_PAYMENT → PENDING_KYC` transition, so duplicate or replayed events are no-ops. The payment ledger is append-only — entries can never be updated or deleted — with separate immutable entries for upfront rent, security deposit, and each refund.

---

## Database Seeding

Platform Admins and Pilot Cities can be initialized via CLI commands:

```bash
# Seed initial platform admin
ADMIN_EMAIL=admin@rentease.in ADMIN_PASSWORD=RentEase@Admin2026 npm run seed:admin -w @rentease/api

# Seed Tier-2/3 pilot cities (Jaipur, Indore, Lucknow, Coimbatore)
npm run seed:cities -w @rentease/api

# Optional realistic Jaipur demo inventory (local/staging only)
DEMO_SEED=true DEMO_PASSWORD='set-a-long-local-password' npm run seed -w @rentease/api
```

For production environments, copy `.env.example` to the hosting-provider secret store and replace every secret. See [Launch Checklist](docs/LAUNCH_CHECKLIST.md) and [Operations Runbook](docs/RUNBOOK.md).

---

## Core Security & Domain Invariants

- **Zero Float Rule:** All monetary amounts are stored and manipulated as positive integer **paise** (1 INR = 100 paise).
- **Upfront Payable:** Calculated strictly server-side as `firstMonthRent + securityDeposit` for the chosen tenure tier.
- **Deposit Transparency:** ₹0 security deposit is a fully supported, validated first-class tier.
- **Vendor Approval Invariant:** Only vendors with `verificationStatus === 'APPROVED'` can publish products with `status === 'active'`. Pending or rejected vendors are strictly restricted to `status === 'draft'`.
- **Vendor Ownership Invariant:** A vendor can only view, update, pause, change stock, or delete their own inventory. Enforced in `productService` by validating `product.vendorId === vendor._id`.
- **Signed Cloudinary Uploads:** Image uploads use short-lived signatures generated server-side. Direct, unauthenticated image writes to Cloudinary are prohibited.
  #   R e n t E a s e - F u r n i t u r e - A p p l i a n c e 
   
   
