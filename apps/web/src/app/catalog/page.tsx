import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PackageSearch } from 'lucide-react';
import { CatalogFilters, type CatalogFilterValues } from '../../components/catalog/CatalogFilters';
import { ProductCard } from '../../components/catalog/ProductCard';
import { CatalogPagination } from '../../components/catalog/CatalogPagination';
import { fetchCatalog, fetchCities } from '../../lib/api';

export const dynamic = 'force-dynamic';

type SearchParams = { [key: string]: string | string[] | undefined };

/** Cookie holding the visitor's last confirmed city, set by the header selector. */
const CITY_COOKIE = 'rentease_city';

/** Query keys the catalog API understands and that we forward verbatim. */
const PASSTHROUGH_KEYS = [
  'page',
  'limit',
  'cityId',
  'pincode',
  'category',
  'subcategory',
  'search',
  'minPricePaise',
  'maxPricePaise',
  'zeroDepositOnly',
  'availability',
  'sort',
] as const;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function toQueryString(searchParams: SearchParams, defaultCityId?: string): string {
  const params = new URLSearchParams();
  for (const key of PASSTHROUGH_KEYS) {
    const value = first(searchParams[key]);
    if (value) params.set(key, value);
  }
  // Fall back to the visitor's persisted city only when they haven't narrowed by
  // city or pincode themselves.
  if (defaultCityId && !params.has('cityId') && !params.has('pincode')) {
    params.set('cityId', defaultCityId);
  }
  return params.toString();
}

function paiseToRupeeInput(value: string | undefined): string {
  if (!value) return '';
  const paise = Number(value);
  return Number.isFinite(paise) ? String(paise / 100) : '';
}

const CATEGORY_LABELS: Record<string, string> = {
  furniture: 'Furniture',
  appliances: 'Appliance',
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const category = first(sp.category);
  const search = first(sp.search);
  const subject =
    category && CATEGORY_LABELS[category] ? CATEGORY_LABELS[category] : 'Furniture & appliance';
  const title = `${subject} rentals${search ? ` for “${search}”` : ''} | RentEase`;

  return {
    title,
    description:
      'Browse verified local furniture and appliance rentals with flexible 1, 3, 6, and 12-month tenures, ₹0-deposit options, and 24–48 hour delivery.',
  };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const cookieStore = await cookies();
  const defaultCityId = cookieStore.get(CITY_COOKIE)?.value;
  const queryString = toQueryString(sp, defaultCityId);

  const [catalog, cities] = await Promise.all([fetchCatalog(queryString), fetchCities()]);
  const { products, pagination } = catalog;

  const initial: CatalogFilterValues = {
    search: first(sp.search) ?? '',
    cityId: first(sp.cityId) ?? defaultCityId ?? '',
    pincode: first(sp.pincode) ?? '',
    category: first(sp.category) ?? '',
    minRupees: paiseToRupeeInput(first(sp.minPricePaise)),
    maxRupees: paiseToRupeeInput(first(sp.maxPricePaise)),
    zeroDepositOnly: first(sp.zeroDepositOnly) === 'true',
    availability: first(sp.availability) ?? '',
    sort: first(sp.sort) ?? '',
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Rentals near you</h1>
        <p className="mt-1 text-sm text-gray-500">
          {pagination.total > 0
            ? `${pagination.total} verified listing${pagination.total === 1 ? '' : 's'} available`
            : 'Browse verified, in-stock local inventory.'}
        </p>
      </div>

      <CatalogFilters cities={cities} initial={initial} />

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <PackageSearch className="mx-auto h-10 w-10 text-gray-400" />
          <h2 className="mt-3 font-semibold">No rentals found</h2>
          <p className="mt-1 text-sm text-gray-500">
            Try another city, pincode, or category — or clear your filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <CatalogPagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        query={queryString}
      />
    </div>
  );
}
