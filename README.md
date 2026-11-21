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

## API Reference (Phase 0)

| Method | Endpoint  | Auth   | Description                               | Response Envelope                                                  |
| :----- | :-------- | :----- | :---------------------------------------- | :----------------------------------------------------------------- |
| `GET`  | `/health` | Public | System uptime & MongoDB connection status | `{ success: true, data: { status: "OK", timestamp, uptime, db } }` |

---

## Money & Financial Integrity Invariants

- **Zero Float Rule:** All monetary amounts are stored and manipulated as positive integer **paise** (1 INR = 100 paise).
- **Upfront Payable:** Calculated strictly server-side as `firstMonthRent + securityDeposit` for the chosen tenure tier.
- **Deposit Transparency:** ₹0 security deposit is a fully supported, validated first-class tier.
