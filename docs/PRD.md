# Product Requirements Document (PRD): RentEase

## 1. Problem Statement

**What problem does this solve?** Renting essential furniture and home appliances in non-metro cities is expensive, rigid, and fragmented. Buying items outright requires high upfront capital and creates resale or transport headaches during relocation, while local offline dealers require heavy cash deposits and lack maintenance guarantees.

**Who experiences this problem?** Relocating college students, early-career working professionals, and temporary residents living in underserved Tier-2 and Tier-3 Indian cities.

**Why does this problem matter now?** National rental platforms (like RentoMojo and Furlenco) rely on capital-heavy centralized warehouses restricted to Tier-1 metro cities. Connecting local furniture and appliance dealers directly to renters via a hyperlocal multi-vendor marketplace unlocks rapid 24–48 hour delivery, competitive vendor-set pricing, and flexible short-term tenures without heavy inventory CapEx.

---

## 2. Target User

- **Primary User (Renter):** Students (ages 18–24) and young working professionals (ages 22–32) relocating to Tier-2/Tier-3 cities for 3–12 months.
  - **Goals:** Furnish a room or apartment quickly within a tight monthly budget, pay minimal upfront deposits, and get 24–48 hour doorstep delivery with reliable repair support.
  - **Frustrations:** High upfront purchase costs, bulky moving logistics, rigid 12-month lock-in contracts, and unresponsive local landlords or dealers.
  - **Behaviors:** Mobile-first browsers who compare monthly rent vs. deposit trade-offs, expect instant UPI/card checkout, and prefer uploading a quick digital ID rather than filling out offline paperwork.
- **Secondary User (Local Vendor):** Regional furniture retailers and appliance dealers looking to monetize idle inventory through recurring monthly rentals and manage deliveries within their city.
- **Tertiary User (Platform Admin):** Operations managers overseeing vendor onboarding, KYC verification, city service zones, dispute resolution, and vendor payouts.

---

## 3. Core Features (MVP Only)

### Must-Have Features (v1 Launch)

1. **City-Aware Catalog & Dynamic Tenure Calculator (Core v1 Focus)**
   - Users select their city/pincode to browse local vendor inventory across Furniture (beds, sofas, study tables) and Appliances (fridges, washing machines, TVs).
   - Product detail pages dynamically calculate total upfront due (First Month Rent + Refundable Security Deposit) across vendor-configured tenures (1, 3, 6, or 12 months), highlighting zero-deposit deals and estimated 24–48 hour delivery windows.
2. **Frictionless Cart, Delivery Scheduling & Razorpay Checkout**
   - Users add items to a cart, select a preferred delivery date/slot and address, and complete payment for the first month's rent plus security deposit via Razorpay (UPI, cards, net banking).
   - Real-time inventory locking prevents double-booking of single-unit vendor items during checkout.
3. **Lightweight Post-Checkout KYC Verification**
   - Immediately after payment, users complete a 1-step KYC upload (Government ID type + number + front/back image upload via Cloudinary) so checkout conversion isn't blocked upfront.
   - Orders move from Pending KYC to Confirmed once approved by Admin/Vendor, or trigger an automatic refund/hold if rejected.
4. **Vendor Inventory & Order Fulfillment Dashboard**
   - Local vendors can register, list products with Cloudinary images, set custom monthly rent, security deposit (including ₹0 deposit), stock count, and tenure tiers, and manage incoming delivery/pickup schedules.
5. **Active Rental, Maintenance & Return Lifecycle Portal**
   - Renters can view active rentals, request maintenance/repairs (with optional photo upload), extend tenure, or schedule a return pickup; Admins/Vendors track status updates and log any damage claims upon return.

### Nice to Have (Post-MVP / Defer if Needed)

- **Automated Razorpay Subscriptions / Auto-Debit:** Recurring monthly e-mandates for months 2+ (v1 can use manual monthly payment links/invoices).
- **Automated Razorpay Route Split Payouts:** Instant commission splitting on every transaction (v1 can track vendor ledger balances for manual/batch payouts).
- **Room Combo Bundles:** Pre-packaged "1BHK Student Starter" or "Work-From-Home" multi-item discounts.

---

## 4. Out of Scope (Do Not Build in v1)

- Native iOS or Android mobile apps (build a responsive, mobile-first web app only).
- Second-hand buy-out / rent-to-own ownership conversion flows.
- AI-based dynamic surge pricing or automated credit-bureau (CIBIL) API checks.
- Cross-city inventory transfers or inter-state relocation shipping.
- In-app live chat between renters and vendors (use structured status updates and support tickets).

---

## 5. Success Metrics

- **Checkout-to-Confirmation Conversion Rate:** Greater than 65% of users who initiate Razorpay checkout successfully complete payment and pass lightweight KYC within 24 hours.
- **Delivery Turnaround Time:** At least 85% of confirmed local orders delivered within 24–48 hours of KYC approval.
- **Inventory Utilization Rate:** At least 60% of active vendor-listed units rented out within 60 days of city launch.
- **Maintenance Resolution Time:** Average resolution time under 48 hours from ticket creation.

---

## 6. Technical Assumptions

- **Platform:** Responsive Web Application (mobile-first UI).
- **Frontend:** Next.js (App Router), React, Tailwind CSS.
- **Backend:** Node.js with Express.js REST API (role-based access control for renter, vendor, and admin).
- **Database:** MongoDB (Mongoose ODM) with indexed queries for city/pincode filtering, product availability, and order states.
- **Authentication:** Custom JWT (access + refresh tokens) supporting Email/Password and Google OAuth 2.0.
- **Third-Party Integrations:**
  - **Razorpay:** Order creation, signature verification webhooks, and refund handling for upfront rent + security deposit.
  - **Cloudinary:** Signed uploads for vendor product galleries, renter KYC documents (stored in restricted/authenticated folders), and maintenance/damage photos.
- **Deployment:** Vercel (Next.js frontend) + Render/Railway/AWS EC2 (Express backend) + MongoDB Atlas.
