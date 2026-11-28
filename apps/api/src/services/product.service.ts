import mongoose from 'mongoose';
import {
  CreateProductInput,
  UpdateProductInput,
  IProduct,
  IPublicProduct,
  PRODUCT_STATUSES,
  PRODUCT_AVAILABILITIES,
  VENDOR_STATUSES,
  LIMITED_STOCK_THRESHOLD,
  CATALOG_SORTS,
  CatalogSort,
  ProductAvailability,
  ProductStatus,
  ProductCategory,
} from '@rentease/shared';
import { Product, formatProduct, toPublicProduct } from '../models/product.model.js';
import { VendorProfile } from '../models/vendor.model.js';
import { City } from '../models/city.model.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/error-handler.js';

export interface CatalogFilters {
  cityId?: string;
  pincode?: string;
  category?: ProductCategory;
  subcategory?: string;
  search?: string;
  minPricePaise?: number;
  maxPricePaise?: number;
  zeroDepositOnly?: boolean;
  availability?: ProductAvailability;
  sort?: CatalogSort;
  inStock?: boolean;
  page?: number;
  limit?: number;
}

function buildCatalogSort(sort?: CatalogSort): Record<string, 1 | -1> {
  switch (sort) {
    case CATALOG_SORTS.PRICE_ASC:
      return { startingRentPaise: 1, _id: 1 };
    case CATALOG_SORTS.PRICE_DESC:
      return { startingRentPaise: -1, _id: 1 };
    case CATALOG_SORTS.FASTEST_DELIVERY:
      return { deliveryLeadTimeHours: 1, _id: 1 };
    case CATALOG_SORTS.NEWEST:
      return { createdAt: -1, _id: 1 };
    default:
      return { updatedAt: -1, _id: 1 };
  }
}

export class ProductService {
  public async listCatalog(filters: CatalogFilters): Promise<{
    products: IPublicProduct[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const query: Record<string, unknown> = { status: PRODUCT_STATUSES.ACTIVE };

    if (filters.category) {
      query.category = filters.category;
    }
    if (filters.subcategory) {
      query.subcategory = filters.subcategory;
    }

    // Availability is expressed only as a coarse bucket; raw stock counts never
    // leave the server. An explicit availability filter overrides the default
    // "hide sold-out listings" behaviour.
    if (filters.availability === PRODUCT_AVAILABILITIES.UNAVAILABLE) {
      query.stockCount = { $lte: 0 };
    } else if (filters.availability === PRODUCT_AVAILABILITIES.LIMITED) {
      query.stockCount = { $gt: 0, $lte: LIMITED_STOCK_THRESHOLD };
    } else if (filters.availability === PRODUCT_AVAILABILITIES.IN_STOCK) {
      query.stockCount = { $gt: LIMITED_STOCK_THRESHOLD };
    } else if (filters.inStock !== false) {
      query.stockCount = { $gt: 0 };
    }

    if (filters.minPricePaise !== undefined || filters.maxPricePaise !== undefined) {
      const priceRange: Record<string, number> = {};
      if (filters.minPricePaise !== undefined) priceRange.$gte = filters.minPricePaise;
      if (filters.maxPricePaise !== undefined) priceRange.$lte = filters.maxPricePaise;
      query.startingRentPaise = priceRange;
    }

    if (filters.zeroDepositOnly) {
      query.securityDepositPaise = 0;
    }

    if (filters.cityId) {
      query.cityId = new mongoose.Types.ObjectId(filters.cityId);
    } else if (filters.pincode) {
      const city = await City.findOne({ isActive: true, pincodes: filters.pincode });
      if (!city) {
        return {
          products: [],
          pagination: {
            page: filters.page ?? 1,
            limit: filters.limit ?? 20,
            total: 0,
            totalPages: 0,
          },
        };
      }
      query.cityId = city._id;

      const matchingVendors = await VendorProfile.find({
        verificationStatus: VENDOR_STATUSES.APPROVED,
        servicePincodes: filters.pincode,
      }).select('_id');
      if (matchingVendors.length > 0) {
        query.vendorId = { $in: matchingVendors.map((vendor) => vendor._id) };
      }
    }
    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { title: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { subcategory: { $regex: escaped, $options: 'i' } },
      ];
    }

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const [products, total] = await Promise.all([
      Product.find(query)
        .sort(buildCatalogSort(filters.sort))
        .skip((page - 1) * limit)
        .limit(limit),
      Product.countDocuments(query),
    ]);

    const vendorIds = [...new Set(products.map((product) => product.vendorId.toString()))];
    const cityIds = [...new Set(products.map((product) => product.cityId.toString()))];
    const [vendors, cities] = await Promise.all([
      VendorProfile.find({ _id: { $in: vendorIds } }),
      City.find({ _id: { $in: cityIds } }),
    ]);
    const vendorNames = new Map(
      vendors.map((vendor) => [vendor._id.toString(), vendor.businessName])
    );
    const cityNames = new Map(cities.map((city) => [city._id.toString(), city.name]));

    return {
      products: products.map((product) =>
        toPublicProduct(
          formatProduct(
            product,
            vendorNames.get(product.vendorId.toString()),
            cityNames.get(product.cityId.toString())
          )
        )
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

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

  public async getProductById(productId: string): Promise<IPublicProduct> {
    const product = await Product.findById(productId);
    if (!product) {
      throw new NotFoundError('Product not found');
    }
    if (product.status !== PRODUCT_STATUSES.ACTIVE || product.stockCount <= 0) {
      throw new NotFoundError('Product not found or is no longer available');
    }

    const vendor = await VendorProfile.findById(product.vendorId);
    const city = await City.findById(product.cityId);

    return toPublicProduct(formatProduct(product, vendor?.businessName, city?.name));
  }
}

export const productService = new ProductService();
