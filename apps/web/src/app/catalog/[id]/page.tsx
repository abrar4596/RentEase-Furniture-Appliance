import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Clock, MapPin, Store, Tag } from 'lucide-react';
import { formatINR, PRODUCT_CONDITIONS, ProductCondition } from '@rentease/shared';
import { fetchProduct } from '../../../lib/api';
import { ProductGallery } from '../../../components/catalog/ProductGallery';
import { ProductPurchasePanel } from '../../../components/catalog/ProductPurchasePanel';
import { Card, CardContent } from '../../../components/ui';

export const dynamic = 'force-dynamic';

type Params = { id: string };

const CONDITION_LABELS: Record<ProductCondition, string> = {
  [PRODUCT_CONDITIONS.BRAND_NEW]: 'Brand new',
  [PRODUCT_CONDITIONS.LIKE_NEW]: 'Like new',
  [PRODUCT_CONDITIONS.REFURBISHED]: 'Refurbished',
};

function deliveryLabel(hours: number): string {
  return hours <= 48 ? '24–48h delivery' : `${hours}h delivery`;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) {
    return { title: 'Rental not found | RentEase' };
  }

  const monthly = formatINR(product.startingRentPaise);
  const description =
    `Rent this ${product.subcategory.toLowerCase()} in ${product.cityName ?? 'your city'} from ` +
    `${monthly}/month with flexible 1, 3, 6, and 12-month tenures` +
    `${product.securityDepositPaise === 0 ? ' and a ₹0 deposit' : ''}. ${product.description}`;

  return {
    title: `${product.title} on rent from ${monthly}/month | RentEase`,
    description: description.slice(0, 300),
    openGraph: {
      title: product.title,
      description: description.slice(0, 300),
      images: product.images[0]?.url ? [product.images[0].url] : undefined,
    },
  };
}

export default async function ProductDetailPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const product = await fetchProduct(id);

  if (!product) notFound();

  const specs = Object.entries(product.specs);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-4 text-sm text-gray-500" aria-label="Breadcrumb">
        <Link href="/catalog" className="hover:text-brand-700">
          Catalog
        </Link>
        <span className="mx-2">/</span>
        <span className="text-gray-700">{product.title}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <ProductGallery images={product.images} title={product.title} />

          {specs.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Specifications</h2>
                <dl className="divide-y divide-gray-100">
                  {specs.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-2 gap-4 py-2 text-sm">
                      <dt className="text-gray-500">{key}</dt>
                      <dd className="font-medium text-gray-900">{value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {product.subcategory}
          </p>
          <h1 className="text-3xl font-bold text-gray-900">{product.title}</h1>
          <p className="text-gray-600">{product.description}</p>

          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            {product.cityName && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4 text-brand-600" />
                {product.cityName}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4 text-brand-600" />
              {deliveryLabel(product.deliveryLeadTimeHours)}
            </span>
            <span className="flex items-center gap-1">
              <Tag className="h-4 w-4 text-brand-600" />
              {CONDITION_LABELS[product.condition]}
            </span>
          </div>

          <Card>
            <CardContent className="space-y-5 p-5">
              {product.vendorBusinessName && (
                <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  <Store className="h-4 w-4 shrink-0 text-brand-600" />
                  <span>
                    Sold &amp; delivered by{' '}
                    <strong className="font-semibold text-gray-900">
                      {product.vendorBusinessName}
                    </strong>
                  </span>
                </div>
              )}

              <ProductPurchasePanel product={product} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
