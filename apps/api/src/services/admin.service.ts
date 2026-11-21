import mongoose from 'mongoose';
import {
  IAdminMetrics,
  IAdminOrderSearchResult,
  IAuditEvent,
  IPlatformSettings,
  IVendorLedgerEntry,
} from '@rentease/shared';
import { Order } from '../models/order.model.js';
import { Product } from '../models/product.model.js';
import { City } from '../models/city.model.js';
import { AuditEvent, formatAudit } from '../models/audit.model.js';
import { PlatformSettings, formatPlatformSettings } from '../models/platform-settings.model.js';
import { VendorLedger, formatVendorLedger } from '../models/vendor-ledger.model.js';
import { NotFoundError, ValidationError } from '../middleware/error-handler.js';

export class AdminService {
  public async getMetrics(): Promise<IAdminMetrics> {
    const [orders, products] = await Promise.all([
      Order.find(),
      Product.find({ status: 'active' }),
    ]);
    const initiated = orders.filter(
      (order) => order.status !== 'PENDING_PAYMENT' || order.razorpayOrderId
    ).length;
    const confirmed = orders.filter(
      (order) =>
        !['PENDING_PAYMENT', 'PENDING_KYC', 'KYC_REJECTED', 'CANCELLED', 'REFUNDED'].includes(
          order.status
        )
    ).length;

    const delivered = orders.filter((order) => order.rentalStartAt);
    const within48 = delivered.filter((order) => {
      if (!order.kyc?.reviewedAt || !order.rentalStartAt) return false;
      return order.rentalStartAt.getTime() - order.kyc.reviewedAt.getTime() <= 48 * 60 * 60 * 1000;
    });

    let activeUnits = 0;
    for (const order of delivered) {
      if (['ACTIVE', 'RETURN_REQUESTED'].includes(order.status)) {
        activeUnits += order.items.reduce((sum, item) => sum + item.quantity, 0);
      }
    }
    const activeListedUnits = products.reduce((sum, product) => sum + product.stockCount, 0);

    const tickets = orders.flatMap((order) =>
      order.maintenanceRequests.map((ticket) => ({
        createdAt: ticket.createdAt,
        resolvedAt: ticket.resolvedAt,
      }))
    );
    const resolved = tickets.filter((ticket) => ticket.resolvedAt);
    const averageResolutionHours = resolved.length
      ? resolved.reduce(
          (sum, ticket) =>
            sum + (ticket.resolvedAt!.getTime() - ticket.createdAt.getTime()) / 3600000,
          0
        ) / resolved.length
      : null;

    return {
      checkoutInitiated: initiated,
      checkoutConfirmed: confirmed,
      conversionPercent: initiated ? (confirmed / initiated) * 100 : 0,
      deliveredWithin48Hours: within48.length,
      deliveredTotal: delivered.length,
      deliveryWithin48Percent: delivered.length ? (within48.length / delivered.length) * 100 : 0,
      activeRentalUnits: activeUnits,
      activeListedUnits,
      inventoryUtilizationPercent: activeListedUnits ? (activeUnits / activeListedUnits) * 100 : 0,
      maintenanceOpen: tickets.length - resolved.length,
      maintenanceResolved: resolved.length,
      maintenanceAverageResolutionHours: averageResolutionHours,
    };
  }

  public async searchOrders(query: {
    status?: string;
    renterId?: string;
    orderId?: string;
  }): Promise<IAdminOrderSearchResult[]> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.renterId) {
      if (!mongoose.isValidObjectId(query.renterId)) throw new ValidationError('Invalid renter ID');
      filter.renterId = new mongoose.Types.ObjectId(query.renterId);
    }
    if (query.orderId) {
      if (!mongoose.isValidObjectId(query.orderId)) throw new ValidationError('Invalid order ID');
      filter._id = new mongoose.Types.ObjectId(query.orderId);
    }
    const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(100);
    return orders.map((order) => ({
      id: order._id.toString(),
      renterId: order.renterId.toString(),
      status: order.status,
      totalUpfrontPaise: order.totalUpfrontPaise,
      preferredDeliveryDate: order.preferredDeliveryDate,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      damageClaim: order.damageClaim
        ? {
            description: order.damageClaim.description,
            deductedPaise: order.damageClaim.deductedPaise,
            disputed: order.damageClaim.disputed,
          }
        : undefined,
    }));
  }

  public async getAudit(entityType?: string, entityId?: string): Promise<IAuditEvent[]> {
    const filter: Record<string, unknown> = {};
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    const events = await AuditEvent.find(filter).sort({ createdAt: -1 }).limit(200);
    return events.map(formatAudit);
  }

  public async arbitrateDamage(
    actorId: string,
    orderId: string,
    input: { decision: 'APPROVE' | 'ADJUST' | 'DISMISS'; deductedPaise?: number; reason: string }
  ): Promise<IAdminOrderSearchResult> {
    if (!mongoose.isValidObjectId(orderId)) throw new ValidationError('Invalid order ID');
    const order = await Order.findById(orderId);
    if (!order) throw new NotFoundError('Order not found');
    if (!order.damageClaim) throw new ValidationError('This order has no damage claim');
    const deposit = order.securityDepositPaise;
    let deduction = order.damageClaim.deductedPaise;
    if (input.decision === 'DISMISS') deduction = 0;
    if (input.decision === 'ADJUST') {
      if (input.deductedPaise === undefined)
        throw new ValidationError('deductedPaise is required for ADJUST');
      deduction = input.deductedPaise;
    }
    if (deduction > deposit)
      throw new ValidationError('Damage deduction cannot exceed the security deposit');
    order.damageClaim.deductedPaise = deduction;
    order.damageClaim.disputed = false;
    order.damageClaim.arbitrationReason = input.reason;
    order.damageClaim.arbitratedAt = new Date();
    order.damageClaim.arbitratedBy = new mongoose.Types.ObjectId(actorId);
    await order.save();
    await this.recordAudit(actorId, 'DAMAGE_CLAIM_ARBITRATED', 'order', orderId, input.reason, {
      decision: input.decision,
      deductedPaise: deduction,
    });
    return {
      id: order._id.toString(),
      renterId: order.renterId.toString(),
      status: order.status,
      totalUpfrontPaise: order.totalUpfrontPaise,
      preferredDeliveryDate: order.preferredDeliveryDate,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      damageClaim: {
        description: order.damageClaim.description,
        deductedPaise: deduction,
        disputed: false,
      },
    };
  }

  public async getSettings(): Promise<IPlatformSettings> {
    let settings = await PlatformSettings.findOne();
    if (!settings) settings = await PlatformSettings.create({});
    return formatPlatformSettings(settings);
  }

  public async updateSettings(
    actorId: string,
    input: Partial<{
      platformCommissionPercent: number;
      kycWindowHours: number;
      reservationTtlMinutes: number;
    }>
  ): Promise<IPlatformSettings> {
    let settings = await PlatformSettings.findOne();
    if (!settings) settings = await PlatformSettings.create({});
    Object.assign(settings, input);
    await settings.save();
    await this.recordAudit(
      actorId,
      'PLATFORM_SETTINGS_UPDATED',
      'settings',
      settings._id.toString(),
      undefined,
      input
    );
    return formatPlatformSettings(settings);
  }

  public async createCity(
    actorId: string,
    input: { name: string; state: string; pincodes: string[]; isActive?: boolean }
  ) {
    const existing = await City.findOne({ name: input.name });
    if (existing) throw new ValidationError('A city with this name already exists');
    const city = await City.create(input);
    await this.recordAudit(actorId, 'CITY_CREATED', 'city', city._id.toString(), undefined, {
      name: city.name,
    });
    return city;
  }

  public async updateCity(
    actorId: string,
    cityId: string,
    input: { name?: string; state?: string; pincodes?: string[]; isActive?: boolean }
  ) {
    if (!mongoose.isValidObjectId(cityId)) throw new ValidationError('Invalid city ID');
    const city = await City.findById(cityId);
    if (!city) throw new NotFoundError('City not found');
    Object.assign(city, input);
    await city.save();
    await this.recordAudit(actorId, 'CITY_UPDATED', 'city', city._id.toString(), undefined, input);
    return city;
  }

  public async listLedger(): Promise<IVendorLedgerEntry[]> {
    const entries = await VendorLedger.find().sort({ createdAt: -1 }).limit(500);
    return entries.map(formatVendorLedger);
  }

  public async recordAudit(
    actorId: string,
    action: string,
    entityType: 'vendor' | 'kyc' | 'order' | 'city' | 'settings',
    entityId: string,
    reason?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await AuditEvent.create({
      actorId: new mongoose.Types.ObjectId(actorId),
      action,
      entityType,
      entityId,
      reason,
      metadata,
    });
  }
}

export const adminService = new AdminService();
