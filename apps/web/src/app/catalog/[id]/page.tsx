'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { IProduct, calculateUpfrontDue, formatINR } from '@rentease/shared';
import { Button, Card, CardContent, Skeleton } from '../../../components/ui';
import { Clock, MapPin, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../components/ui';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function ProductDetailPage() {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();
  const params = useParams();
  const router = useRouter();
  const [product, setProduct] = useState<IProduct | null>(null);
  const [selectedTenure, setSelectedTenure] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) return;
    fetch(`${API_BASE}/products/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProduct(data.data.product);
          setSelectedTenure(data.data.product.tenureTiers[0]?.tenureMonths ?? 1);
        }
      })
      .finally(() => setIsLoading(false));
  }, [params.id]);

  const selectedTier = useMemo(
    () => product?.tenureTiers.find((tier) => tier.tenureMonths === selectedTenure),
    [product, selectedTenure]
  );
  const upfrontDue =
    product && selectedTier
      ? calculateUpfrontDue(selectedTier.monthlyRentPaise, product.securityDepositPaise)
      : 0;

  const addToCart = async () => {
    if (!accessToken) {
      router.push(`/login?next=${encodeURIComponent(`/catalog/${params.id}`)}`);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/cart/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ productId: product?.id, tenureMonths: selectedTenure, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Could not add item');
      success('Added to cart', product?.title);
      router.push('/cart');
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Could not add item', 'Cart');
    }
  };

  if (isLoading)
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  if (!product)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-xl font-bold">Product unavailable</h1>
        <Button className="mt-4" onClick={() => router.push('/catalog')}>
          Back to catalog
        </Button>
      </div>
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {product.images[0]?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.images[0].url}
              alt={product.title}
              className="h-[420px] w-full object-cover"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center text-gray-400">
              No image available
            </div>
          )}
        </div>
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {product.subcategory}
          </p>
          <h1 className="text-3xl font-bold text-gray-900">{product.title}</h1>
          <p className="text-gray-600">{product.description}</p>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4 text-brand-600" />
              {product.cityName}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-brand-600" />
              {product.deliveryLeadTimeHours <= 48
                ? '24–48h delivery'
                : `${product.deliveryLeadTimeHours}h delivery`}
            </span>
          </div>

          <Card>
            <CardContent className="space-y-5 p-5">
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-800">Choose tenure</p>
                <div className="grid grid-cols-4 gap-2">
                  {product.tenureTiers.map((tier) => (
                    <button
                      key={tier.tenureMonths}
                      type="button"
                      onClick={() => setSelectedTenure(tier.tenureMonths)}
                      className={`rounded-lg border px-2 py-2 text-sm font-semibold ${selectedTenure === tier.tenureMonths ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-700'}`}
                    >
                      {tier.tenureMonths} mo
                    </button>
                  ))}
                </div>
              </div>

              {selectedTier && (
                <div className="space-y-2 border-t border-gray-100 pt-4">
                  <div className="flex justify-between text-sm">
                    <span>Monthly rent</span>
                    <strong>{formatINR(selectedTier.monthlyRentPaise)}</strong>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Refundable deposit</span>
                    <strong>{formatINR(product.securityDepositPaise)}</strong>
                  </div>
                  <div className="flex justify-between border-t border-gray-100 pt-3 text-base">
                    <span className="font-semibold">Pay upfront</span>
                    <strong className="text-brand-700">{formatINR(upfrontDue)}</strong>
                  </div>
                </div>
              )}
              <Button className="w-full" disabled={!selectedTier} onClick={addToCart}>
                Add to cart
              </Button>
              {product.securityDepositPaise === 0 && (
                <p className="flex items-center justify-center gap-1 text-xs font-semibold text-emerald-700">
                  <ShieldCheck className="h-4 w-4" />
                  Zero-deposit rental
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
