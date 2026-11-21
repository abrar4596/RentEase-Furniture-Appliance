'use client';

import React, { useState, useEffect } from 'react';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CONDITIONS,
  PRODUCT_STATUSES,
  FURNITURE_SUBCATEGORIES,
  APPLIANCE_SUBCATEGORIES,
  ProductCategory,
  ProductCondition,
  ProductStatus,
  ProductImage,
  IProduct,
  CreateProductInput,
  rupeesToPaise,
  paiseToRupees,
} from '@rentease/shared';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { ImageUploader } from './ImageUploader';
import { useToast } from '../ui/Toast';
import { Plus, Trash2, AlertCircle } from 'lucide-react';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  product?: IProduct | null;
  vendorCityId: string;
  isApprovedVendor: boolean;
  accessToken: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export function ProductModal({
  isOpen,
  onClose,
  onSaved,
  product,
  vendorCityId,
  isApprovedVendor,
  accessToken,
}: ProductModalProps) {
  const { success, error: toastError } = useToast();

  const [category, setCategory] = useState<ProductCategory>(PRODUCT_CATEGORIES.FURNITURE);
  const [subcategory, setSubcategory] = useState<string>(FURNITURE_SUBCATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [condition, setCondition] = useState<ProductCondition>(PRODUCT_CONDITIONS.LIKE_NEW);
  const [stockCount, setStockCount] = useState<number>(3);
  const [securityDepositRupees, setSecurityDepositRupees] = useState<number>(0);
  const [leadTimeHours, setLeadTimeHours] = useState<number>(48);
  const [status, setStatus] = useState<ProductStatus>(PRODUCT_STATUSES.DRAFT);
  const [images, setImages] = useState<ProductImage[]>([]);

  // Tenure Tier pricing in Rupees (converted to integer paise on submit)
  const [rent1m, setRent1m] = useState<number>(1499);
  const [rent3m, setRent3m] = useState<number>(1299);
  const [rent6m, setRent6m] = useState<number>(1099);
  const [rent12m, setRent12m] = useState<number>(899);

  // Specifications key-value pairs
  const [specsList, setSpecsList] = useState<Array<{ key: string; value: string }>>([
    { key: 'Material', value: 'Sheesham Wood' },
  ]);

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (product) {
      setCategory(product.category);
      setSubcategory(product.subcategory);
      setTitle(product.title);
      setDescription(product.description);
      setCondition(product.condition);
      setStockCount(product.stockCount);
      setSecurityDepositRupees(paiseToRupees(product.securityDepositPaise));
      setLeadTimeHours(product.deliveryLeadTimeHours);
      setStatus(product.status);
      setImages(product.images);

      // Populate tiers
      const t1 = product.tenureTiers.find((t) => t.tenureMonths === 1);
      const t3 = product.tenureTiers.find((t) => t.tenureMonths === 3);
      const t6 = product.tenureTiers.find((t) => t.tenureMonths === 6);
      const t12 = product.tenureTiers.find((t) => t.tenureMonths === 12);
      if (t1) setRent1m(paiseToRupees(t1.monthlyRentPaise));
      if (t3) setRent3m(paiseToRupees(t3.monthlyRentPaise));
      if (t6) setRent6m(paiseToRupees(t6.monthlyRentPaise));
      if (t12) setRent12m(paiseToRupees(t12.monthlyRentPaise));

      // Populate specs
      const specsArr = Object.entries(product.specs || {}).map(([key, value]) => ({ key, value }));
      setSpecsList(specsArr.length > 0 ? specsArr : [{ key: 'Material', value: '' }]);
    } else {
      // Reset defaults
      setCategory(PRODUCT_CATEGORIES.FURNITURE);
      setSubcategory(FURNITURE_SUBCATEGORIES[0]);
      setTitle('');
      setDescription('');
      setCondition(PRODUCT_CONDITIONS.LIKE_NEW);
      setStockCount(3);
      setSecurityDepositRupees(0);
      setLeadTimeHours(48);
      setStatus(isApprovedVendor ? PRODUCT_STATUSES.ACTIVE : PRODUCT_STATUSES.DRAFT);
      setImages([]);
      setRent1m(1499);
      setRent3m(1299);
      setRent6m(1099);
      setRent12m(899);
      setSpecsList([{ key: 'Material', value: 'Sheesham Wood' }]);
    }
  }, [product, isOpen, isApprovedVendor]);

  const handleAddSpec = () => {
    setSpecsList([...specsList, { key: '', value: '' }]);
  };

  const handleRemoveSpec = (idx: number) => {
    setSpecsList(specsList.filter((_, i) => i !== idx));
  };

  const handleSpecChange = (idx: number, field: 'key' | 'value', val: string) => {
    const updated = [...specsList];
    updated[idx]![field] = val;
    setSpecsList(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (images.length === 0) {
      toastError('Please upload at least one product image');
      return;
    }

    if (status === PRODUCT_STATUSES.ACTIVE && !isApprovedVendor) {
      toastError('Your vendor profile is pending review. Listings can only be saved as draft.');
      return;
    }

    // Build specs record
    const specsMap: Record<string, string> = {};
    for (const item of specsList) {
      if (item.key.trim() && item.value.trim()) {
        specsMap[item.key.trim()] = item.value.trim();
      }
    }

    // Build tenure tiers in integer paise
    const tenureTiers = [
      { tenureMonths: 1 as const, monthlyRentPaise: rupeesToPaise(rent1m) },
      { tenureMonths: 3 as const, monthlyRentPaise: rupeesToPaise(rent3m) },
      { tenureMonths: 6 as const, monthlyRentPaise: rupeesToPaise(rent6m) },
      { tenureMonths: 12 as const, monthlyRentPaise: rupeesToPaise(rent12m) },
    ];

    const payload: CreateProductInput = {
      category,
      subcategory,
      title,
      description,
      specs: specsMap,
      images,
      condition,
      stockCount: Number(stockCount),
      securityDepositPaise: rupeesToPaise(securityDepositRupees),
      tenureTiers,
      deliveryLeadTimeHours: Number(leadTimeHours),
      cityId: vendorCityId,
      status,
    };

    setIsLoading(true);

    try {
      const url = product ? `${API_BASE}/products/${product.id}` : `${API_BASE}/products`;
      const method = product ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to save product');
      }

      success(product ? 'Product updated successfully' : 'Product created successfully');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving product';
      toastError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const subcategoryOptions =
    category === PRODUCT_CATEGORIES.FURNITURE ? FURNITURE_SUBCATEGORIES : APPLIANCE_SUBCATEGORIES;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product ? 'Edit Product Listing' : 'Add New Rental Listing'}
      description="List your inventory with flexible tenure pricing and delivery estimates."
      className="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6 pt-2">
        {!isApprovedVendor && (
          <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <p>
              Your vendor verification is pending. You can draft listings now; they will become
              publishable once an admin approves your profile.
            </p>
          </div>
        )}

        {/* Category & Subcategory */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Category</label>
            <select
              value={category}
              onChange={(e) => {
                const newCat = e.target.value as ProductCategory;
                setCategory(newCat);
                setSubcategory(
                  newCat === PRODUCT_CATEGORIES.FURNITURE
                    ? FURNITURE_SUBCATEGORIES[0]
                    : APPLIANCE_SUBCATEGORIES[0]
                );
              }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-brand-500 min-h-[44px]"
            >
              <option value={PRODUCT_CATEGORIES.FURNITURE}>Furniture</option>
              <option value={PRODUCT_CATEGORIES.APPLIANCES}>Appliances</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">Subcategory</label>
            <select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-brand-500 focus:ring-brand-500 min-h-[44px]"
            >
              {subcategoryOptions.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Title & Description */}
        <Input
          label="Product Title"
          placeholder="e.g. Solid Sheesham Wood Queen Bed with Mattress"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea
            required
            rows={3}
            placeholder="Detailed description of item condition, materials, inclusions..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-300 p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:ring-brand-500"
          />
        </div>

        {/* Condition, Stock, Deposit, Lead Time */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-700">Condition</label>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value as ProductCondition)}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 min-h-[40px]"
            >
              <option value={PRODUCT_CONDITIONS.BRAND_NEW}>Brand New</option>
              <option value={PRODUCT_CONDITIONS.LIKE_NEW}>Like New</option>
              <option value={PRODUCT_CONDITIONS.REFURBISHED}>Refurbished</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">
              Available Stock
            </label>
            <input
              type="number"
              min={0}
              required
              value={stockCount}
              onChange={(e) => setStockCount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 min-h-[40px]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Deposit (₹)</label>
            <input
              type="number"
              min={0}
              required
              value={securityDepositRupees}
              onChange={(e) => setSecurityDepositRupees(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 min-h-[40px]"
              placeholder="0 for Free Deposit"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Delivery SLA</label>
            <select
              value={leadTimeHours}
              onChange={(e) => setLeadTimeHours(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-900 min-h-[40px]"
            >
              <option value={24}>24 Hours</option>
              <option value={48}>48 Hours</option>
              <option value={72}>72 Hours</option>
            </select>
          </div>
        </div>

        {/* Dynamic Tenure Tier Pricing (Monthly Rent in ₹) */}
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">
              Monthly Rent per Tenure Tier (₹/month)
            </h4>
            <span className="text-xs text-gray-500">Longer tenures typically offer discounts</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">1 Month</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-xs text-gray-400 font-semibold">
                  ₹
                </span>
                <input
                  type="number"
                  min={1}
                  required
                  value={rent1m}
                  onChange={(e) => setRent1m(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">3 Months</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-xs text-gray-400 font-semibold">
                  ₹
                </span>
                <input
                  type="number"
                  min={1}
                  required
                  value={rent3m}
                  onChange={(e) => setRent3m(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">6 Months</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-xs text-gray-400 font-semibold">
                  ₹
                </span>
                <input
                  type="number"
                  min={1}
                  required
                  value={rent6m}
                  onChange={(e) => setRent6m(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-gray-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">12 Months</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-xs text-gray-400 font-semibold">
                  ₹
                </span>
                <input
                  type="number"
                  min={1}
                  required
                  value={rent12m}
                  onChange={(e) => setRent12m(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-lg border border-gray-300 pl-6 pr-2 py-1.5 text-xs text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Specifications Builder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Key Specifications</label>
            <button
              type="button"
              onClick={handleAddSpec}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <Plus className="h-3 w-3" />
              Add Spec
            </button>
          </div>

          <div className="space-y-2">
            {specsList.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  placeholder="Feature (e.g. Dimensions)"
                  value={item.key}
                  onChange={(e) => handleSpecChange(idx, 'key', e.target.value)}
                  className="w-1/3 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900"
                />
                <input
                  placeholder="Value (e.g. 78 x 60 x 36 inches)"
                  value={item.value}
                  onChange={(e) => handleSpecChange(idx, 'value', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-900"
                />
                {specsList.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveSpec(idx)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded"
                    aria-label="Remove spec"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Image Uploader */}
        <ImageUploader images={images} onChange={setImages} />

        {/* Listing Status */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Listing Status</label>
          <div className="flex gap-4">
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="status"
                value={PRODUCT_STATUSES.DRAFT}
                checked={status === PRODUCT_STATUSES.DRAFT}
                onChange={() => setStatus(PRODUCT_STATUSES.DRAFT)}
                className="text-brand-600"
              />
              Draft
            </label>
            <label
              className={`inline-flex items-center gap-2 text-sm ${
                isApprovedVendor ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <input
                type="radio"
                name="status"
                value={PRODUCT_STATUSES.ACTIVE}
                disabled={!isApprovedVendor}
                checked={status === PRODUCT_STATUSES.ACTIVE}
                onChange={() => setStatus(PRODUCT_STATUSES.ACTIVE)}
                className="text-brand-600"
              />
              Active {!isApprovedVendor && '(Requires Admin Approval)'}
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="status"
                value={PRODUCT_STATUSES.PAUSED}
                checked={status === PRODUCT_STATUSES.PAUSED}
                onChange={() => setStatus(PRODUCT_STATUSES.PAUSED)}
                className="text-brand-600"
              />
              Paused
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isLoading}>
            {product ? 'Save Changes' : 'Create Listing'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
