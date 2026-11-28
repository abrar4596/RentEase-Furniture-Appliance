import {
  DEFAULT_DELIVERY_LEAD_TIME_HOURS,
  DEFAULT_SLOT_CAPACITY,
  DeliverySlot,
  DeliverySlotOption,
  DeliverySlotsView,
  DELIVERY_SLOT_VALUES,
  DELIVERY_SLOT_WINDOWS,
  MAX_DELIVERY_HORIZON_DAYS,
  ORDER_STATES,
  OrderState,
} from '@rentease/shared';
import { City } from '../models/city.model.js';
import { ICartDocument } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { Order } from '../models/order.model.js';
import { PlatformSettings } from '../models/platform-settings.model.js';
import { ValidationError } from '../middleware/error-handler.js';

/**
 * Orders that still hold a delivery commitment (i.e. not yet delivered, not
 * cancelled/refunded). Only these consume daily slot capacity.
 */
const SLOT_OCCUPYING_STATUSES: OrderState[] = [
  ORDER_STATES.PENDING_PAYMENT,
  ORDER_STATES.PENDING_KYC,
  ORDER_STATES.KYC_REJECTED,
  ORDER_STATES.CONFIRMED,
];

function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00`);
  return date;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/** The exact instant a slot window opens on the given date. */
function slotWindowStart(date: Date, slot: DeliverySlot): Date {
  const start = new Date(date);
  start.setHours(DELIVERY_SLOT_WINDOWS[slot].startHour, 0, 0, 0);
  return start;
}

export class DeliverySlotService {
  private async getSettings(): Promise<{ capacity: number; blackoutDates: string[] }> {
    const settings = await PlatformSettings.findOne();
    return {
      capacity: settings?.deliverySlotCapacity || DEFAULT_SLOT_CAPACITY,
      blackoutDates: settings?.blackoutDates ?? [],
    };
  }

  /** Longest lead time across the cart's vendors' products. */
  public async resolveLeadTimeHours(cart: ICartDocument): Promise<number> {
    const productIds = cart.items.map((item) => item.productId);
    if (productIds.length === 0) return DEFAULT_DELIVERY_LEAD_TIME_HOURS;
    const products = await Product.find({ _id: { $in: productIds } }).select(
      'deliveryLeadTimeHours'
    );
    const hours = products
      .map((product) => product.deliveryLeadTimeHours)
      .filter((value) => Number.isFinite(value) && value > 0);
    return hours.length ? Math.max(...hours) : DEFAULT_DELIVERY_LEAD_TIME_HOURS;
  }

  private async assertServiceable(pincode: string): Promise<void> {
    const city = await City.findOne({ isActive: true, pincodes: pincode });
    if (!city) throw new ValidationError('Delivery pincode is not currently serviceable');
  }

  private async occupancyBySlot(date: string): Promise<Record<DeliverySlot, number>> {
    const rows = await Order.aggregate<{ _id: DeliverySlot; count: number }>([
      {
        $match: {
          preferredDeliveryDate: date,
          status: { $in: SLOT_OCCUPYING_STATUSES },
        },
      },
      { $group: { _id: '$preferredDeliverySlot', count: { $sum: 1 } } },
    ]);
    const counts: Record<DeliverySlot, number> = {
      morning: 0,
      afternoon: 0,
      evening: 0,
    };
    for (const row of rows) {
      if (DELIVERY_SLOT_VALUES.includes(row._id)) counts[row._id] = row.count;
    }
    return counts;
  }

  private buildSlotOptions(
    date: Date,
    leadTimeHours: number,
    capacity: number,
    blackout: boolean,
    occupancy: Record<DeliverySlot, number>
  ): DeliverySlotOption[] {
    const earliestBookable = new Date(Date.now() + leadTimeHours * 60 * 60 * 1000);
    return DELIVERY_SLOT_VALUES.map((slot) => {
      const window = DELIVERY_SLOT_WINDOWS[slot];
      const used = occupancy[slot] ?? 0;
      const remaining = Math.max(0, capacity - used);
      const windowStart = slotWindowStart(date, slot);

      let available = true;
      let reason: string | undefined;
      if (blackout) {
        available = false;
        reason = 'No deliveries are scheduled on this date';
      } else if (windowStart < earliestBookable) {
        available = false;
        reason = 'Too soon — vendors need more lead time for this slot';
      } else if (remaining <= 0) {
        available = false;
        reason = 'This slot is fully booked';
      }

      return {
        slot,
        label: window.label,
        startHour: window.startHour,
        endHour: window.endHour,
        available,
        remaining: available ? remaining : 0,
        reason,
      };
    });
  }

  /** Server-computed slot availability for the delivery picker. */
  public async getSlots(
    cart: ICartDocument,
    pincode: string,
    dateString: string
  ): Promise<DeliverySlotsView> {
    const date = parseDateOnly(dateString);
    const { capacity, blackoutDates } = await this.getSettings();
    const leadTimeHours = await this.resolveLeadTimeHours(cart);

    await this.assertServiceable(pincode);

    const today = startOfToday();
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + MAX_DELIVERY_HORIZON_DAYS);
    const inHorizon = !Number.isNaN(date.getTime()) && date >= today && date <= horizon;
    const blackout = blackoutDates.includes(dateString);

    const occupancy = inHorizon
      ? await this.occupancyBySlot(dateString)
      : { morning: 0, afternoon: 0, evening: 0 };
    const slots = this.buildSlotOptions(
      date,
      leadTimeHours,
      capacity,
      blackout || !inHorizon,
      occupancy
    );

    // Earliest realistic date: now + lead time (clamped to today), skipping blackout dates.
    const earliest = new Date(Date.now() + leadTimeHours * 60 * 60 * 1000);
    if (earliest < today) earliest.setTime(today.getTime());
    const earliestDate = new Date(earliest);
    for (let i = 0; i <= MAX_DELIVERY_HORIZON_DAYS; i += 1) {
      if (!blackoutDates.includes(toDateString(earliestDate))) break;
      earliestDate.setDate(earliestDate.getDate() + 1);
    }

    return {
      pincode,
      date: dateString,
      serviceable: true,
      blackout,
      capacity,
      leadTimeHours,
      earliestEligibleDate: toDateString(earliestDate),
      slots,
    };
  }

  /** Throws when a specific pincode + date + slot cannot be booked. */
  public async assertSlotBookable(
    cart: ICartDocument,
    pincode: string,
    dateString: string,
    slot: DeliverySlot
  ): Promise<void> {
    const view = await this.getSlots(cart, pincode, dateString);
    const option = view.slots.find((entry) => entry.slot === slot);
    if (!option || !option.available) {
      throw new ValidationError(option?.reason || 'The selected delivery slot is not available');
    }
  }
}

export const deliverySlotService = new DeliverySlotService();
