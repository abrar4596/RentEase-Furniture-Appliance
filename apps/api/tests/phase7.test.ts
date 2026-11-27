import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { getTestMongoUri } from './global-setup.js';
import { User } from '../src/models/user.model.js';
import { City } from '../src/models/city.model.js';
import { VendorProfile } from '../src/models/vendor.model.js';
import { Order } from '../src/models/order.model.js';
import { VendorLedger } from '../src/models/vendor-ledger.model.js';
import { PlatformSettings } from '../src/models/platform-settings.model.js';
import { checkoutService } from '../src/services/checkout.service.js';
import { payoutService } from '../src/services/payout.service.js';
import { VENDOR_STATUSES } from '@rentease/shared';

describe('Phase 7: Vendor Fulfillment and Ledger', () => {
  beforeAll(async () => {
    await mongoose.connect(getTestMongoUri());
  });
  afterAll(async () => {
    await mongoose.disconnect();
  });
  beforeEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      City.deleteMany({}),
      VendorProfile.deleteMany({}),
      Order.deleteMany({}),
      VendorLedger.deleteMany({}),
      PlatformSettings.deleteMany({}),
    ]);
  });

  async function seed(commissionPercent = 20) {
    const passwordHash = await bcrypt.hash('Password@123', 4);
    const [vendorUser, renter, admin] = await Promise.all([
      User.create({
        email: 'vendor-phase7@test.local',
        name: 'Vendor',
        role: 'vendor',
        status: 'active',
        passwordHash,
        authProviders: [{ provider: 'local' }],
      }),
      User.create({
        email: 'renter-phase7@test.local',
        name: 'Renter',
        role: 'renter',
        status: 'active',
        passwordHash,
        authProviders: [{ provider: 'local' }],
      }),
      User.create({
        email: 'admin-phase7@test.local',
        name: 'Admin',
        role: 'admin',
        status: 'active',
        passwordHash,
        authProviders: [{ provider: 'local' }],
      }),
    ]);
    const city = await City.create({
      name: 'Test City',
      state: 'Test State',
      pincodes: ['302001'],
      isActive: true,
    });
    const vendor = await VendorProfile.create({
      userId: vendorUser._id,
      businessName: 'Phase 7 Furnishings',
      contactPhone: '9876543210',
      cityId: city._id,
      servicePincodes: ['302001'],
      verificationStatus: VENDOR_STATUSES.APPROVED,
      commissionPercent,
    });
    await PlatformSettings.create({ platformCommissionPercent: 15 });
    return { vendorUser, renter, admin, vendor };
  }

  it('records fulfillment timestamps and uses the vendor commission override', async () => {
    const { vendorUser, renter, vendor } = await seed();
    const order = await Order.create({
      renterId: renter._id,
      items: [
        {
          productId: new mongoose.Types.ObjectId(),
          title: 'Test Sofa',
          vendorId: vendor._id,
          tenureMonths: 3,
          quantity: 1,
          monthlyRentPaise: 5000_00,
          securityDepositPaise: 5000_00,
          lineTotalPaise: 10000_00,
        },
      ],
      deliveryAddress: {
        fullName: 'Phase 7 Renter',
        phone: '9876543210',
        line1: '1 Test Road',
        city: 'Test City',
        state: 'Test State',
        pincode: '302001',
      },
      preferredDeliveryDate: '2026-12-01',
      preferredDeliverySlot: 'morning',
      subtotalRentPaise: 5000_00,
      securityDepositPaise: 5000_00,
      totalUpfrontPaise: 10000_00,
      status: 'PENDING_KYC',
      kyc: {
        documentType: 'PAN',
        documentNumber: 'ABCDE1234F',
        frontDocument: { publicId: 'front', url: 'https://example.com/front.jpg' },
        submittedAt: new Date(),
      },
    });

    const approved = await checkoutService.adminReviewKyc(vendorUser._id.toString(), order.id, {
      decision: 'APPROVED',
    });
    expect(approved.status).toBe('CONFIRMED');
    expect(approved.kycApprovedAt).toBeDefined();

    const out = await checkoutService.updateVendorOrderStatus(
      vendorUser._id.toString(),
      order.id,
      'OUT_FOR_DELIVERY'
    );
    expect(out.outForDeliveryAt).toBeDefined();

    const delivered = await checkoutService.updateVendorOrderStatus(
      vendorUser._id.toString(),
      order.id,
      'ACTIVE'
    );
    expect(delivered.deliveredAt).toBeDefined();
    expect(delivered.rentalStartAt).toBeDefined();
    expect(delivered.rentalEndAt).toBeDefined();

    const ledger = await VendorLedger.findOne({ orderId: order._id });
    expect(ledger?.commissionPercent).toBe(20);
    expect(ledger?.commissionPaise).toBe(1000_00);
    expect(ledger?.netPayablePaise).toBe(4000_00);
  });

  it('marks valid pending ledger entries paid atomically', async () => {
    const { admin, vendor } = await seed();
    const order = await Order.create({
      renterId: new mongoose.Types.ObjectId(),
      items: [],
      deliveryAddress: {
        fullName: 'Renter',
        phone: '9876543210',
        line1: '1 Road',
        city: 'Test City',
        state: 'Test State',
        pincode: '302001',
      },
      preferredDeliveryDate: '2026-12-01',
      preferredDeliverySlot: 'morning',
      subtotalRentPaise: 1000_00,
      securityDepositPaise: 0,
      totalUpfrontPaise: 1000_00,
      status: 'CONFIRMED',
    });
    const ledger = await VendorLedger.create({
      vendorId: vendor._id,
      orderId: order._id,
      grossRentPaise: 1000_00,
      commissionPercent: 20,
      commissionPaise: 200_00,
      netPayablePaise: 800_00,
      status: 'PENDING',
    });

    const paid = await payoutService.markPaid(admin._id.toString(), {
      vendorId: vendor.id,
      ledgerEntryIds: [ledger.id],
      payoutReference: 'UTR-PHASE7-001',
    });
    expect(paid).toHaveLength(1);
    expect(paid[0].status).toBe('PAID');
    expect(paid[0].payoutReference).toBe('UTR-PHASE7-001');
  });
});
