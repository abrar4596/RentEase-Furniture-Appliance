import type { ICity, IPublicProduct } from '@rentease/shared';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export interface CatalogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface CatalogResult {
  products: IPublicProduct[];
  pagination: CatalogPagination;
}

const EMPTY_CATALOG: CatalogResult = {
  products: [],
  pagination: { page: 1, limit: 0, total: 0, totalPages: 0 },
};

/**
 * Thin server-side reader for the public RentEase API.
 *
 * Availability and pricing are real-time, so nothing here is cached. A network
 * or validation failure degrades to an empty result instead of throwing, which
 * keeps the catalog renderable even when the API is unreachable.
 */
async function fetchApiData<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const payload = (await res.json()) as { success: boolean; data: T };
    return payload.success ? payload.data : null;
  } catch {
    return null;
  }
}

export async function fetchCatalog(queryString: string): Promise<CatalogResult> {
  const suffix = queryString ? `?${queryString}` : '';
  return (await fetchApiData<CatalogResult>(`/catalog${suffix}`)) ?? EMPTY_CATALOG;
}

export async function fetchProduct(id: string): Promise<IPublicProduct | null> {
  const data = await fetchApiData<{ product: IPublicProduct }>(
    `/products/${encodeURIComponent(id)}`
  );
  return data?.product ?? null;
}

export async function fetchCities(): Promise<ICity[]> {
  const data = await fetchApiData<{ cities: ICity[] }>('/cities');
  return data?.cities ?? [];
}
