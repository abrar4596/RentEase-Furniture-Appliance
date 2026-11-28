'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  calculateTenureQuote,
  formatINR,
  IPublicProduct,
  PRODUCT_AVAILABILITIES,
} from '@rentease/shared';
import { Button, useToast } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { BadgeCheck, ShieldCheck, TrendingDown } from 'lucide-react';
import { cn } from '../../lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

const AVAILABILITY_STYLES: Record<string, string> = {
  [PRODUCT_AVAILABILITIES.IN_STOCK]: 'bg-emerald-50 text-emerald-700',
  [PRODUCT_AVAILABILITIES.LIMITED]: 'bg-amber-50 text-amber-700',
  [PRODUCT_AVAILABILITIES.UNAVAILABLE]: 'bg-gray-100 text-gray-600',
};

/**
 * Interactive purchase panel for a product.
 *
 * The displayed breakdown is produced by the SAME `calculateTenureQuote` used on
 * the server, so the rent, deposit, savings, and upfront total a renter sees can
 * never drift from the authoritative calculation.
 */
export function ProductPurchasePanel({ product }: { product: IPublicProduct }) {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();
  const router = useRouter();

  const tiers = product.tenureTiers;
  const [selectedTenure, setSelectedTenure] = useState<number>(tiers[0]?.tenureMonths ?? 1);
  const [isAdding, setIsAdding] = useState(false);

  const quote = useMemo(() => {
    try {
      return calculateTenureQuote(tiers, product.securityDepositPaise, selectedTenure);
    } catch {
      return null;
    }
  }, [tiers, product.securityDepositPaise, selectedTenure]);

  const isUnavailable = product.availability === PRODUCT_AVAILABILITIES.UNAVAILABLE;

  const addToCart = async () => {
    if (!accessToken) {
      router.push(`/login?next=${encodeURIComponent(`/catalog/${product.id}`)}`);
      return;
    }
    setIsAdding(true);
    try {
      const res = await fetch(`${API_BASE}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ productId: product.id, tenureMonths: selectedTenure, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Could not add item');
      success('Added to cart', product.title);
      router.push('/cart');
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Could not add item', 'Cart');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-5">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
          AVAILABILITY_STYLES[product.availability] ?? 'bg-gray-100 text-gray-600'
        )}
      >
        <BadgeCheck className="h-3.5 w-3.5" />
        {product.availability === PRODUCT_AVAILABILITIES.IN_STOCK
          ? 'In stock'
          : product.availability === PRODUCT_AVAILABILITIES.LIMITED
            ? 'Limited stock'
            : 'Out of stock'}
      </span>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-800">Choose tenure</p>
        <div className="grid grid-cols-4 gap-2">
          {tiers.map((tier) => (
            <button
              key={tier.tenureMonths}
              type="button"
              onClick={() => setSelectedTenure(tier.tenureMonths)}
              className={cn(
                'rounded-lg border px-2 py-2 text-sm font-semibold transition-colors',
                selectedTenure === tier.tenureMonths
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-700 hover:border-gray-300'
              )}
            >
              {tier.tenureMonths} mo
            </button>
          ))}
        </div>
      </div>

      {quote && (
        <div className="space-y-2 border-t border-gray-100 pt-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Monthly rent</span>
            <strong className="text-gray-900">{formatINR(quote.monthlyRentPaise)}</strong>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Refundable deposit</span>
            <strong className="text-gray-900">
              {quote.securityDepositPaise === 0 ? '₹0' : formatINR(quote.securityDepositPaise)}
            </strong>
          </div>

          {quote.savingsPerMonthPaise > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-1.5 font-medium text-emerald-800">
                <TrendingDown className="h-4 w-4" />
                You save {formatINR(quote.savingsPerMonthPaise)}/month
              </span>
              <span className="font-semibold text-emerald-700">{quote.savingsPercent}% off</span>
            </div>
          )}

          {quote.totalSavingsPaise > 0 && (
            <p className="text-xs text-emerald-700">
              Total saving of {formatINR(quote.totalSavingsPaise)} over {quote.tenureMonths} month
              {quote.tenureMonths === 1 ? '' : 's'} versus the shortest tenure.
            </p>
          )}

          <div className="flex justify-between border-t border-gray-100 pt-3 text-base">
            <span className="font-semibold text-gray-900">Pay upfront</span>
            <strong className="text-brand-700">{formatINR(quote.upfrontDuePaise)}</strong>
          </div>
          <p className="text-xs text-gray-500">
            First month rent + refundable deposit, payable today.
          </p>
        </div>
      )}

      <Button
        className="w-full"
        disabled={!quote || isUnavailable}
        isLoading={isAdding}
        onClick={addToCart}
      >
        {isUnavailable ? 'Currently unavailable' : 'Add to cart'}
      </Button>

      {product.securityDepositPaise === 0 && (
        <p className="flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700">
          <ShieldCheck className="h-4 w-4" />
          Zero-deposit rental
        </p>
      )}
    </div>
  );
}
