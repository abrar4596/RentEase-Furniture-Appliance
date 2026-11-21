import mongoose from 'mongoose';
import {
  CreateProductInput,
  UpdateProductInput,
  IProduct,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
  ProductStatus,
  ProductCategory,
} from '@rentease/shared';
import { Product, formatProduct } from '../models/product.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { City } from '../models/city.model.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/error-handler.js';

export class ProductService {
  /**
   * Creates a product listing for an authenticated vendor.
   * Only APPROVED vendors can publish directly to 'active'; PENDING vendors are constrained to 'draft'.
   */
  public async createProduct(userId: string, input: CreateProductInput): Promise<IProduct> {
    const vendor = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!vendor) {
      throw new ForbiddenError('You must set up a vendor profile before listing products');
    }

    if (
      input.status === PRODUCT_STATUSES.ACTIVE &&
      vendor.verificationStatus !== VENDOR_STATUSES.APPROVED
    ) {
      throw new ForbiddenError(
        'Your vendor account is pending verification. Products can only be saved as draft until approved.'
      );
    }

    const city = await City.findById(input.cityId);
    if (!city || !city.isActive) {
      throw new ValidationError('The specified city is invalid or inactive');
    }

    // Validate tier pricing: must be distinct tenures, all monthlyRentPaise > 0
    const seenTenures = new Set<number>();
    for (const tier of input.tenureTiers) {
      if (seenTenures.has(tier.tenureMonths)) {
        throw new ValidationError(
          `Duplicate tenure tier specified for ${tier.tenureMonths} months`
        );
      }
      seenTenures.add(tier.tenureMonths);
      if (tier.monthlyRentPaise <= 0) {
        throw new ValidationError('Monthly rent must be a positive integer in paise');
      }
    }

    const product = await Product.create({
      vendorId: vendor._id,
      cityId: city._id,
      category: input.category,
      subcategory: input.subcategory,
      title: input.title,
      description: input.description,
      specs: input.specs,
      images: input.images,
      condition: input.condition,
      stockCount: input.stockCount,
      securityDepositPaise: input.securityDepositPaise,
      tenureTiers: input.tenureTiers,
      deliveryLeadTimeHours: input.deliveryLeadTimeHours,
      status: input.status,
    });

    return formatProduct(product, vendor.businessName, city.name);
  }

  /**
   * Updates an existing product with strict vendor ownership enforcement
   */
  public async updateProduct(
    userId: string,
    productId: string,
    input: UpdateProductInput
  ): Promise<IProduct> {
    const vendor = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!vendor) {
      throw new ForbiddenError('Vendor profile not found');
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    // Strict ownership guard
    if (product.vendorId.toString() !== vendor._id.toString()) {
      throw new ForbiddenError('You are not authorized to modify this product listing');
    }

    if (
      input.status === PRODUCT_STATUSES.ACTIVE &&
      vendor.verificationStatus !== VENDOR_STATUSES.APPROVED
    ) {
      throw new ForbiddenError(
        'Your vendor account is pending verification. Products can only be saved as draft until approved.'
      );
    }

    if (input.cityId) {
      const city = await City.findById(input.cityId);
      if (!city || !city.isActive) {
        throw new ValidationError('The specified city is invalid or inactive');
      }
      product.cityId = city._id;
    }

    if (input.tenureTiers) {
      const seenTenures = new Set<number>();
      for (const tier of input.tenureTiers) {
        if (seenTenures.has(tier.tenureMonths)) {
          throw new ValidationError(
            `Duplicate tenure tier specified for ${tier.tenureMonths} months`
          );
        }
        seenTenures.add(tier.tenureMonths);
        if (tier.monthlyRentPaise <= 0) {
          throw new ValidationError('Monthly rent must be a positive integer in paise');
        }
      }
      product.tenureTiers = input.tenureTiers;
    }

    if (input.category) product.category = input.category;
    if (input.subcategory) product.subcategory = input.subcategory;
    if (input.title) product.title = input.title;
    if (input.description) product.description = input.description;
    if (input.specs) product.specs = input.specs;
    if (input.images) product.images = input.images;
    if (input.condition) product.condition = input.condition;
    if (input.stockCount !== undefined) product.stockCount = input.stockCount;
    if (input.securityDepositPaise !== undefined)
      product.securityDepositPaise = input.securityDepositPaise;
    if (input.deliveryLeadTimeHours !== undefined)
      product.deliveryLeadTimeHours = input.deliveryLeadTimeHours;
    if (input.status) product.status = input.status;

    await product.save();
    const city = await City.findById(product.cityId);
    return formatProduct(product, vendor.businessName, city?.name);
  }

  public async updateStock(
    userId: string,
    productId: string,
    stockCount: number
  ): Promise<IProduct> {
    return this.updateProduct(userId, productId, { stockCount });
  }

  public async updateStatus(
    userId: string,
    productId: string,
    status: ProductStatus
  ): Promise<IProduct> {
    return this.updateProduct(userId, productId, { status });
  }

  public async deleteProduct(userId: string, productId: string): Promise<void> {
    const vendor = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!vendor) {
      throw new ForbiddenError('Vendor profile not found');
    }

    const product = await Product.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    if (product.vendorId.toString() !== vendor._id.toString()) {
      throw new ForbiddenError('You are not authorized to delete this product listing');
    }

    await Product.deleteOne({ _id: product._id });
  }

  public async listVendorProducts(
    userId: string,
    filters?: { status?: ProductStatus; category?: ProductCategory }
  ): Promise<IProduct[]> {
    const vendor = await VendorProfile.findOne({ userId: new mongoose.Types.ObjectId(userId) });
    if (!vendor) {
      return [];
    }

    const query: Record<string, unknown> = { vendorId: vendor._id };
    if (filters?.status) query.status = filters.status;
    if (filters?.category) query.category = filters.category;

    const products = await Product.find(query).sort({ updatedAt: -1 });
    const city = await City.findById(vendor.cityId);

    return products.map((p) => formatProduct(p, vendor.businessName, city?.name));
  }

  public async getProductById(productId: string): Promise<IProduct> {
    const product = await Product.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }

    const vendor = await VendorProfile.findById(product.vendorId);
    const city = await City.findById(product.cityId);

    return formatProduct(product, vendor?.businessName, city?.name);
  }
}

export const productService = new ProductService();
