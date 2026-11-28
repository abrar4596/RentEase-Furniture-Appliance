import React from 'react';
import Link from 'next/link';
import {
  availabilityLabel,
  formatINR,
  IPublicProduct,
  PRODUCT_AVAILABILITIES,
} from '@rentease/shared';
import { Card, CardContent } from '../ui';
import { cn } from '../../lib/utils';

const AVAILABILITY_STYLES: Record<string, string> = {
  [PRODUCT_AVAILABILITIES.IN_STOCK]: 'bg-emerald-50 text-emerald-700',
  [PRODUCT_AVAILABILITIES.LIMITED]: 'bg-amber-50 text-amber-700',
  [PRODUCT_AVAILABILITIES.UNAVAILABLE]: 'bg-gray-100 text-gray-600',
};

/**
 * Renter-facing catalog tile. Renders the derived availability bucket and the
 * "from" price only — raw vendor stock counts never reach the client.
 */
export function ProductCard({ product }: { product: IPublicProduct }) {
  const coverImage = product.images[0];

  return (
    <Link href={`/catalog/${product.id}`} className="group block">
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <div className="relative h-44 bg-gray-100">
          {coverImage?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImage.url}
              alt={product.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">No image</div>
          )}
          <span
            className={cn(
              'absolute left-3 top-3 rounded-full px-2 py-1 text-xs font-semibold',
              AVAILABILITY_STYLES[product.availability] ?? 'bg-gray-100 text-gray-600'
            )}
          >
            {availabilityLabel(product.availability)}
          </span>
        </div>
        <CardContent className="space-y-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">
            {product.subcategory}
          </p>
          <h2 className="line-clamp-2 font-semibold text-gray-900">{product.title}</h2>
          <p className="text-sm text-gray-500">
            {product.vendorBusinessName} · {product.cityName}
          </p>
          <div className="flex items-end justify-between pt-2">
            <div>
              <span className="text-lg font-bold text-gray-900">
                {formatINR(product.startingRentPaise)}
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
}
