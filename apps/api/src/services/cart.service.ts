import mongoose from 'mongoose';
import { Cart, DeliveryAddress, PRODUCT_STATUSES, VENDOR_STATUSES } from '@rentease/shared';
import { Cart as CartModel, ICartDocument } from '../models/cart.model.js';
import { Product } from '../models/product.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { City } from '../models/city.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../middleware/error-handler.js';

function formatCart(doc: ICartDocument): Cart {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    items: doc.items.map((item) => ({
      ...item,
      productId: item.productId.toString(),
    })),
    deliveryAddress: doc.deliveryAddress,
    preferredDeliveryDate: doc.preferredDeliveryDate,
    preferredDeliverySlot: doc.preferredDeliverySlot,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export class CartService {
  public async getCart(userId: string): Promise<Cart> {
    let cart = await CartModel.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!cart) {
      cart = await CartModel.create({ userId, items: [] });
    }
    return formatCart(cart);
  }

  public async addItem(
    userId: string,
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
    const tier = product.tenureTiers.find((item) => item.tenureMonths === input.tenureMonths);
    if (!tier) throw new ValidationError('Selected tenure is not available for this product');

    let cart = await CartModel.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!cart) cart = await CartModel.create({ userId, items: [] });
    const existing = cart.items.find((item) => item.productId.toString() === input.productId);
    if (existing) {
      existing.quantity = existing.quantity + input.quantity;
      existing.tenureMonths = input.tenureMonths;
      if (existing.quantity > product.stockCount)
        throw new ConflictError('Requested quantity exceeds available stock');
    } else {
      cart.items.push({
        productId: new mongoose.Types.ObjectId(input.productId),
        tenureMonths: input.tenureMonths,
        quantity: input.quantity,
        monthlyRentPaise: tier.monthlyRentPaise,
        securityDepositPaise: product.securityDepositPaise,
        unit: 'month',
        title: product.title,
        imageUrl: product.images[0]?.url,
      });
    }
    await cart.save();
    return formatCart(cart);
  }

  public async updateItem(
    userId: string,
    productId: string,
    input: { tenureMonths?: number; quantity?: number }
  ): Promise<Cart> {
    const cart = await CartModel.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!cart) throw new NotFoundError('Cart not found');
    const item = cart.items.find((entry) => entry.productId.toString() === productId);
    if (!item) throw new NotFoundError('Cart item not found');
    const product = await Product.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (input.quantity !== undefined && input.quantity > product.stockCount) {
      throw new ConflictError('Requested quantity exceeds available stock');
    }
    if (input.tenureMonths !== undefined) {
      if (!product.tenureTiers.some((tier) => tier.tenureMonths === input.tenureMonths)) {
        throw new ValidationError('Selected tenure is not available for this product');
      }
      const tier = product.tenureTiers.find((entry) => entry.tenureMonths === input.tenureMonths)!;
      item.tenureMonths = input.tenureMonths;
      item.monthlyRentPaise = tier.monthlyRentPaise;
    }
    if (input.quantity !== undefined) item.quantity = input.quantity;
    await cart.save();
    return formatCart(cart);
  }

  public async removeItem(userId: string, productId: string): Promise<Cart> {
    const cart = await CartModel.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!cart) throw new NotFoundError('Cart not found');
    const originalLength = cart.items.length;
    cart.items = cart.items.filter((item) => item.productId.toString() !== productId);
    if (cart.items.length === originalLength) throw new NotFoundError('Cart item not found');
    await cart.save();
    return formatCart(cart);
  }

  public async clearCart(userId: string): Promise<void> {
    await CartModel.findOneAndUpdate(
      { userId: new mongoose.Types.ObjectId(userId) },
      { $set: { items: [] } }
    );
  }

  public async setDelivery(
    userId: string,
    input: {
      deliveryAddress: DeliveryAddress;
      preferredDeliveryDate: string;
      preferredDeliverySlot: 'morning' | 'afternoon' | 'evening';
    }
  ): Promise<Cart> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const date = new Date(`${input.preferredDeliveryDate}T00:00:00`);
    if (Number.isNaN(date.getTime()) || date < today) {
      throw new ValidationError('Preferred delivery date must be today or in the future');
    }
    const servicedCity = await City.findOne({
      isActive: true,
      pincodes: input.deliveryAddress.pincode,
    });
    if (!servicedCity) throw new ValidationError('Delivery pincode is not currently serviceable');

    const cart = await CartModel.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!cart) throw new NotFoundError('Cart not found');
    cart.deliveryAddress = input.deliveryAddress;
    cart.preferredDeliveryDate = input.preferredDeliveryDate;
    cart.preferredDeliverySlot = input.preferredDeliverySlot;
    await cart.save();
    return formatCart(cart);
  }
}

export const cartService = new CartService();
