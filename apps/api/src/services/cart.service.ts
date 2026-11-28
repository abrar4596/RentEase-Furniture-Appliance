import mongoose from 'mongoose';
import {
  Cart,
  CartItem,
  CartTotals,
  CartVendorGroup,
  DeliveryAddress,
  DeliverySlot,
  DeliverySlotsView,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
  calculateUpfrontDue,
} from '@rentease/shared';
import { Cart as CartModel, ICartDocument, ICartItemDocument } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { City } from '../models/city.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/error-handler.js';
import { deliverySlotService } from './delivery-slot.service.js';

/** How long an abandoned guest (device) cart is retained before it self-expires. */
const GUEST_CART_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type CartOwner = { kind: 'user'; userId: string } | { kind: 'guest'; guestId: string };

function ownerFilter(owner: CartOwner): Record<string, unknown> {
  return owner.kind === 'user'
    ? { userId: new mongoose.Types.ObjectId(owner.userId) }
    : { guestId: owner.guestId };
}

function toCartItem(doc: ICartItemDocument): CartItem {
  const lineRentPaise = doc.monthlyRentPaise * doc.quantity;
  const lineDepositPaise = doc.securityDepositPaise * doc.quantity;
  return {
    productId: doc.productId.toString(),
    vendorId: doc.vendorId.toString(),
    vendorBusinessName: doc.vendorBusinessName,
    tenureMonths: doc.tenureMonths,
    quantity: doc.quantity,
    monthlyRentPaise: doc.monthlyRentPaise,
    securityDepositPaise: doc.securityDepositPaise,
    unit: 'month',
    title: doc.title,
    imageUrl: doc.imageUrl,
    lineRentPaise,
    lineDepositPaise,
    lineTotalPaise: lineRentPaise + lineDepositPaise,
  };
}

function computeTotals(items: CartItem[]): CartTotals {
  const subtotalRentPaise = items.reduce((sum, item) => sum + item.lineRentPaise, 0);
  const securityDepositPaise = items.reduce((sum, item) => sum + item.lineDepositPaise, 0);
  return {
    itemCount: items.length,
    unitCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotalRentPaise,
    securityDepositPaise,
    // `calculateUpfrontDue` rejects a zero-rent input, so an empty cart is simply ₹0.
    totalUpfrontPaise:
      subtotalRentPaise > 0 ? calculateUpfrontDue(subtotalRentPaise, securityDepositPaise) : 0,
  };
}

function buildVendorGroups(items: CartItem[]): CartVendorGroup[] {
  const groups = new Map<string, CartItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.vendorId) ?? [];
    bucket.push(item);
    groups.set(item.vendorId, bucket);
  }
  return [...groups.entries()].map(([vendorId, groupItems]) => {
    const subtotalRentPaise = groupItems.reduce((sum, item) => sum + item.lineRentPaise, 0);
    const securityDepositPaise = groupItems.reduce((sum, item) => sum + item.lineDepositPaise, 0);
    return {
      vendorId,
      vendorBusinessName: groupItems[0]?.vendorBusinessName,
      items: groupItems,
      subtotalRentPaise,
      securityDepositPaise,
      totalUpfrontPaise:
        subtotalRentPaise > 0 ? calculateUpfrontDue(subtotalRentPaise, securityDepositPaise) : 0,
    };
  });
}

/** Compares two item lists on the fields that affect pricing so we only persist real changes. */
function itemsChanged(current: ICartItemDocument[], next: ICartItemDocument[]): boolean {
  if (current.length !== next.length) return true;
  return next.some((item, index) => {
    const previous = current[index];
    if (!previous) return true;
    return (
      previous.productId.toString() !== item.productId.toString() ||
      previous.tenureMonths !== item.tenureMonths ||
      previous.quantity !== item.quantity ||
      previous.monthlyRentPaise !== item.monthlyRentPaise ||
      previous.securityDepositPaise !== item.securityDepositPaise ||
      previous.vendorId.toString() !== item.vendorId.toString()
    );
  });
}

export class CartService {
  private async findOrCreateCart(owner: CartOwner): Promise<ICartDocument> {
    const filter = ownerFilter(owner);
    const existing = await CartModel.findOne(filter);
    if (existing) return existing;
    const base =
      owner.kind === 'user'
        ? { userId: new mongoose.Types.ObjectId(owner.userId), items: [] }
        : {
            guestId: owner.guestId,
            items: [],
            guestExpiresAt: new Date(Date.now() + GUEST_CART_TTL_MS),
          };
    return CartModel.create(base);
  }

  /**
   * Recomputes every line from the live product catalogue and returns the
   * authoritative cart view. Lines whose product is delisted, whose vendor is no
   * longer approved, or whose tenure tier has been removed are dropped; quantities
   * are clamped to available stock. This is the single source of cart pricing —
   * the acceptance criterion is that display totals always equal these values.
   */
  private async buildCartView(cart: ICartDocument): Promise<Cart> {
    const productIds = cart.items.map((item) => item.productId);
    const products = productIds.length ? await Product.find({ _id: { $in: productIds } }) : [];
    const productMap = new Map(products.map((product) => [product._id.toString(), product]));

    const vendorIds = [...new Set(products.map((product) => product.vendorId.toString()))];
    const vendors = vendorIds.length ? await VendorProfile.find({ _id: { $in: vendorIds } }) : [];
    const vendorMap = new Map(vendors.map((vendor) => [vendor._id.toString(), vendor]));

    const normalized: ICartItemDocument[] = [];
    for (const item of cart.items) {
      const product = productMap.get(item.productId.toString());
      if (!product || product.status !== PRODUCT_STATUSES.ACTIVE) continue;
      const vendor = vendorMap.get(product.vendorId.toString());
      if (!vendor || vendor.verificationStatus !== VENDOR_STATUSES.APPROVED) continue;
      const tier = product.tenureTiers.find((entry) => entry.tenureMonths === item.tenureMonths);
      if (!tier) continue;
      const quantity = Math.min(item.quantity, product.stockCount);
      if (quantity < 1) continue;
      normalized.push({
        productId: product._id,
        vendorId: product.vendorId,
        vendorBusinessName: vendor.businessName,
        tenureMonths: item.tenureMonths,
        quantity,
        monthlyRentPaise: tier.monthlyRentPaise,
        securityDepositPaise: product.securityDepositPaise,
        unit: 'month',
        title: product.title,
        imageUrl: product.images[0]?.url,
      });
    }

    if (itemsChanged(cart.items, normalized)) {
      cart.items = normalized;
      await cart.save();
    }

    const items = cart.items.map(toCartItem);
    return {
      id: cart._id.toString(),
      userId: cart.userId?.toString(),
      guestId: cart.guestId,
      items,
      vendorGroups: buildVendorGroups(items),
      totals: computeTotals(items),
      deliveryAddress: cart.deliveryAddress,
      preferredDeliveryDate: cart.preferredDeliveryDate,
      preferredDeliverySlot: cart.preferredDeliverySlot,
      updatedAt: cart.updatedAt.toISOString(),
    };
  }

  public async getCart(owner: CartOwner): Promise<Cart> {
    const cart = await this.findOrCreateCart(owner);
    return this.buildCartView(cart);
  }

  public async addItem(
    owner: CartOwner,
    input: { productId: string; tenureMonths: number; quantity: number }
  ): Promise<Cart> {
    if (!mongoose.isValidObjectId(input.productId)) throw new ValidationError('Invalid product ID');
    const product = await Product.findById(input.productId);
    if (
      !product ||
      product.status !== PRODUCT_STATUSES.ACTIVE ||
      product.stockCount < input.quantity
    ) {
      throw new ConflictError('Product is unavailable or does not have enough stock');
    }
    const vendor = await VendorProfile.findById(product.vendorId);
    if (!vendor || vendor.verificationStatus !== VENDOR_STATUSES.APPROVED) {
      throw new ConflictError('Product is not available for sale');
    }
    const tier = product.tenureTiers.find((entry) => entry.tenureMonths === input.tenureMonths);
    if (!tier) throw new ValidationError('Selected tenure is not available for this product');

    const cart = await this.findOrCreateCart(owner);
    const existing = cart.items.find((item) => item.productId.toString() === input.productId);
    if (existing) {
      const nextQuantity = existing.quantity + input.quantity;
      if (nextQuantity > product.stockCount) {
        throw new ConflictError('Requested quantity exceeds available stock');
      }
      existing.quantity = nextQuantity;
      existing.tenureMonths = input.tenureMonths;
    } else {
      cart.items.push({
        productId: new mongoose.Types.ObjectId(input.productId),
        vendorId: product.vendorId,
        vendorBusinessName: vendor.businessName,
        tenureMonths: input.tenureMonths,
        quantity: input.quantity,
        monthlyRentPaise: tier.monthlyRentPaise,
        securityDepositPaise: product.securityDepositPaise,
        unit: 'month',
        title: product.title,
        imageUrl: product.images[0]?.url,
      });
    }
    if (owner.kind === 'guest') {
      cart.guestExpiresAt = new Date(Date.now() + GUEST_CART_TTL_MS);
    }
    await cart.save();
    return this.buildCartView(cart);
  }

  public async updateItem(
    owner: CartOwner,
    productId: string,
    input: { tenureMonths?: number; quantity?: number }
  ): Promise<Cart> {
    const cart = await CartModel.findOne(ownerFilter(owner));
    if (!cart) throw new NotFoundError('Cart not found');
    const item = cart.items.find((entry) => entry.productId.toString() === productId);
    if (!item) throw new NotFoundError('Cart item not found');
    const product = await Product.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (input.quantity !== undefined && input.quantity > product.stockCount) {
      throw new ConflictError('Requested quantity exceeds available stock');
    }
    if (input.tenureMonths !== undefined) {
      const tier = product.tenureTiers.find((entry) => entry.tenureMonths === input.tenureMonths);
      if (!tier) {
        throw new ValidationError('Selected tenure is not available for this product');
      }
      item.tenureMonths = input.tenureMonths;
      item.monthlyRentPaise = tier.monthlyRentPaise;
    }
    if (input.quantity !== undefined) item.quantity = input.quantity;
    await cart.save();
    return this.buildCartView(cart);
  }

  public async removeItem(owner: CartOwner, productId: string): Promise<Cart> {
    const cart = await CartModel.findOne(ownerFilter(owner));
    if (!cart) throw new NotFoundError('Cart not found');
    const originalLength = cart.items.length;
    cart.items = cart.items.filter((item) => item.productId.toString() !== productId);
    if (cart.items.length === originalLength) throw new NotFoundError('Cart item not found');
    await cart.save();
    return this.buildCartView(cart);
  }

  public async clearCart(owner: CartOwner): Promise<void> {
    await CartModel.findOneAndUpdate(ownerFilter(owner), { $set: { items: [] } });
  }

  public async setDelivery(
    owner: CartOwner,
    input: {
      deliveryAddress: DeliveryAddress;
      preferredDeliveryDate: string;
      preferredDeliverySlot: DeliverySlot;
    }
  ): Promise<Cart> {
    const cart = await CartModel.findOne(ownerFilter(owner));
    if (!cart) throw new NotFoundError('Cart not found');
    if (cart.items.length === 0) throw new ValidationError('Your cart is empty');

    await deliverySlotService.assertSlotBookable(
      cart,
      input.deliveryAddress.pincode,
      input.preferredDeliveryDate,
      input.preferredDeliverySlot
    );

    cart.deliveryAddress = input.deliveryAddress;
    cart.preferredDeliveryDate = input.preferredDeliveryDate;
    cart.preferredDeliverySlot = input.preferredDeliverySlot;
    await cart.save();
    return this.buildCartView(cart);
  }

  /**
   * Moves an anonymous guest cart into the authenticated user's cart on login.
   * Each line is re-validated and re-priced; lines that are no longer valid are
   * dropped rather than failing the login. The guest cart is then removed.
   */
  public async mergeGuestCart(guestId: string, userId: string): Promise<void> {
    const guestCart = await CartModel.findOne({ guestId });
    if (!guestCart) return;
    const target: CartOwner = { kind: 'user', userId };
    for (const item of guestCart.items) {
      try {
        await this.addItem(target, {
          productId: item.productId.toString(),
          tenureMonths: item.tenureMonths,
          quantity: item.quantity,
        });
      } catch {
        // Line is no longer purchasable — skip it; merging must never break login.
      }
    }
    const userCart = await CartModel.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (userCart) {
      if (!userCart.deliveryAddress && guestCart.deliveryAddress) {
        userCart.deliveryAddress = guestCart.deliveryAddress;
      }
      if (!userCart.preferredDeliveryDate && guestCart.preferredDeliveryDate) {
        userCart.preferredDeliveryDate = guestCart.preferredDeliveryDate;
      }
      if (!userCart.preferredDeliverySlot && guestCart.preferredDeliverySlot) {
        userCart.preferredDeliverySlot = guestCart.preferredDeliverySlot;
      }
      await userCart.save();
    }
    await guestCart.deleteOne();
  }

  /** Server-computed delivery slot availability for the cart's delivery picker. */
  public async getDeliverySlots(
    owner: CartOwner,
    pincode: string,
    date: string
  ): Promise<DeliverySlotsView> {
    const cart = await this.findOrCreateCart(owner);
    return deliverySlotService.getSlots(cart, pincode, date);
  }

  /** Serviceability check reused by the address book and delivery scheduler. */
  public async assertServiceablePincode(pincode: string): Promise<void> {
    const servicedCity = await City.findOne({ isActive: true, pincodes: pincode });
    if (!servicedCity) throw new ValidationError('Delivery pincode is not currently serviceable');
  }
}

export const cartService = new CartService();
