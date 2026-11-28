'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ICity, PRODUCT_AVAILABILITIES } from '@rentease/shared';
import { Input } from '../ui';
import { MapPin, Search, X } from 'lucide-react';

export interface CatalogFilterValues {
  search: string;
  cityId: string;
  pincode: string;
  category: string;
  minRupees: string;
  maxRupees: string;
  zeroDepositOnly: boolean;
  availability: string;
  sort: string;
}

const SORT_OPTIONS = [
  { value: '', label: 'Recommended' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'fastest_delivery', label: 'Fastest delivery' },
  { value: 'newest', label: 'Newest first' },
];

const AVAILABILITY_OPTIONS = [
  { value: '', label: 'Any availability' },
  { value: PRODUCT_AVAILABILITIES.IN_STOCK, label: 'In stock' },
  { value: PRODUCT_AVAILABILITIES.LIMITED, label: 'Limited stock' },
];

function rupeesToPaiseString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const rupees = Number(trimmed);
  if (!Number.isFinite(rupees) || rupees < 0) return null;
  return String(Math.round(rupees * 100));
}

/**
 * Client-side catalog controls.
 *
 * Every change rebuilds the query string (always resetting to page 1) and pushes
 * it as the URL, so the server component re-renders with fresh results. Text
 * fields are debounced to avoid a request per keystroke.
 */
export function CatalogFilters({
  cities,
  initial,
}: {
  cities: ICity[];
  initial: CatalogFilterValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<CatalogFilterValues>(initial);
  const isFirstRender = useRef(true);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (values.search.trim()) params.set('search', values.search.trim());
    if (values.cityId) params.set('cityId', values.cityId);
    if (values.pincode.trim()) params.set('pincode', values.pincode.trim());
    if (values.category) params.set('category', values.category);
    const minPaise = rupeesToPaiseString(values.minRupees);
    const maxPaise = rupeesToPaiseString(values.maxRupees);
    if (minPaise) params.set('minPricePaise', minPaise);
    if (maxPaise) params.set('maxPricePaise', maxPaise);
    if (values.zeroDepositOnly) params.set('zeroDepositOnly', 'true');
    if (values.availability) params.set('availability', values.availability);
    if (values.sort) params.set('sort', values.sort);
    return params.toString();
  }, [values]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      router.push(`/catalog${queryString ? `?${queryString}` : ''}`, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [queryString, router]);

  const update = <K extends keyof CatalogFilterValues>(key: K, value: CatalogFilterValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const isDirty =
    values.search !== initial.search ||
    values.cityId !== initial.cityId ||
    values.pincode !== initial.pincode ||
    values.category !== initial.category ||
    values.minRupees !== initial.minRupees ||
    values.maxRupees !== initial.maxRupees ||
    values.zeroDepositOnly !== initial.zeroDepositOnly ||
    values.availability !== initial.availability ||
    values.sort !== initial.sort;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
        <Input
          leftAddon={<Search className="h-4 w-4" />}
          placeholder="Search furniture or appliances"
          value={values.search}
          onChange={(e) => update('search', e.target.value)}
          aria-label="Search rentals"
        />
        <label className="flex items-center gap-2 rounded-lg border border-gray-300 px-3">
          <MapPin className="h-4 w-4 shrink-0 text-brand-600" />
          <select
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            value={values.cityId}
            onChange={(e) => update('cityId', e.target.value)}
            aria-label="Filter by city"
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
          className="min-h-[44px] rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
          value={values.category}
          onChange={(e) => update('category', e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          <option value="furniture">Furniture</option>
          <option value="appliances">Appliances</option>
        </select>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          placeholder="Pincode"
          inputMode="numeric"
          value={values.pincode}
          onChange={(e) => update('pincode', e.target.value)}
          aria-label="Filter by pincode"
        />
        <Input
          placeholder="Min ₹/month"
          inputMode="numeric"
          value={values.minRupees}
          onChange={(e) => update('minRupees', e.target.value)}
          aria-label="Minimum monthly rent in rupees"
        />
        <Input
          placeholder="Max ₹/month"
          inputMode="numeric"
          value={values.maxRupees}
          onChange={(e) => update('maxRupees', e.target.value)}
          aria-label="Maximum monthly rent in rupees"
        />
        <select
          className="min-h-[44px] rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
          value={values.availability}
          onChange={(e) => update('availability', e.target.value)}
          aria-label="Filter by availability"
        >
          {AVAILABILITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="min-h-[44px] rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
          value={values.sort}
          onChange={(e) => update('sort', e.target.value)}
          aria-label="Sort results"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            checked={values.zeroDepositOnly}
            onChange={(e) => update('zeroDepositOnly', e.target.checked)}
          />
          Zero-deposit rentals only
        </label>

        {isDirty && (
          <button
            type="button"
            onClick={() => setValues(initial)}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            <X className="h-3.5 w-3.5" />
            Clear changes
          </button>
        )}
      </div>
    </div>
  );
}
