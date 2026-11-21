'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ICity, IProduct, formatINR } from '@rentease/shared';
import { Card, CardContent, Input, Skeleton } from '../../components/ui';
import { MapPin, Search, PackageSearch } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

function CatalogContent() {
  const searchParams = useSearchParams();
  const [cities, setCities] = useState<ICity[]>([]);
  const [cityId, setCityId] = useState(searchParams.get('cityId') || '');
  const [pincode, setPincode] = useState(searchParams.get('pincode') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [products, setProducts] = useState<IProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/cities`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setCities(data.data.cities);
      })
      .catch(() => setCities([]));
  }, []);

  const fetchCatalog = useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (cityId) params.set('cityId', cityId);
    if (pincode) params.set('pincode', pincode);
    if (category) params.set('category', category);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`${API_BASE}/catalog?${params.toString()}`);
      const data = await res.json();
      setProducts(res.ok && data.success ? data.data.products : []);
    } catch {
      setProducts([]);
    } finally {
      setIsLoading(false);
    }
  }, [category, cityId, pincode, search]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rentals near you</h1>
        <p className="mt-1 text-sm text-gray-500">Browse verified, in-stock local inventory.</p>
      </div>

      <div className="mb-6 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_180px_auto]">
        <Input
          leftAddon={<Search className="h-4 w-4" />}
          placeholder="Search furniture or appliances"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 rounded-md border border-gray-300 px-3">
          <MapPin className="h-4 w-4 text-brand-600" />
          <select
            className="w-full bg-transparent py-2 text-sm outline-none"
            value={cityId}
            onChange={(e) => setCityId(e.target.value)}
          >
            <option value="">All cities</option>
            {cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
        </label>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          <option value="furniture">Furniture</option>
          <option value="appliances">Appliances</option>
        </select>
        <Input placeholder="Pincode" value={pincode} onChange={(e) => setPincode(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-72 w-full" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <PackageSearch className="mx-auto h-10 w-10 text-gray-400" />
          <h2 className="mt-3 font-semibold">No rentals found</h2>
          <p className="mt-1 text-sm text-gray-500">Try another city, pincode, or category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const lowestTier = [...product.tenureTiers].sort(
              (a, b) => a.monthlyRentPaise - b.monthlyRentPaise
            )[0];
            return (
              <Link key={product.id} href={`/catalog/${product.id}`}>
                <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                  <div className="h-44 bg-gray-100">
                    {product.images[0]?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.images[0].url}
                        alt={product.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-gray-400">
                        No image
                      </div>
                    )}
                  </div>
                  <CardContent className="space-y-2 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
                      {product.subcategory}
                    </p>
                    <h2 className="font-semibold text-gray-900">{product.title}</h2>
                    <p className="text-sm text-gray-500">
                      {product.vendorBusinessName} · {product.cityName}
                    </p>
                    <div className="flex items-end justify-between pt-2">
                      <div>
                        <span className="text-lg font-bold text-gray-900">
                          {formatINR(lowestTier?.monthlyRentPaise ?? 0)}
                        </span>
                        <span className="text-xs text-gray-500"> /month</span>
                      </div>
                      {product.securityDepositPaise === 0 && (
                        <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          ₹0 deposit
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-8">
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <CatalogContent />
    </Suspense>
  );
}
