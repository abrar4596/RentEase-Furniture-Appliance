import React from 'react';
import Link from 'next/link';

function buildHref(query: string, page: number): string {
  const params = new URLSearchParams(query);
  params.set('page', String(page));
  return `/catalog?${params.toString()}`;
}

function pageItems(current: number, total: number): Array<number | 'gap'> {
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);

  const items: Array<number | 'gap'> = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) items.push('gap');
    items.push(page);
    previous = page;
  }
  return items;
}

export function CatalogPagination({
  page,
  totalPages,
  query,
}: {
  page: number;
  totalPages: number;
  query: string;
}) {
  if (totalPages <= 1) return null;

  const items = pageItems(page, totalPages);
  const baseLink =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors';

  return (
    <nav aria-label="Catalog pagination" className="mt-8 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Link
          href={buildHref(query, page - 1)}
          className={`${baseLink} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
          rel="prev"
        >
          Previous
        </Link>
      ) : (
        <span className={`${baseLink} cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400`}>
          Previous
        </span>
      )}

      {items.map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="px-1 text-gray-400">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={buildHref(query, item)}
            aria-current={item === page ? 'page' : undefined}
            className={`${baseLink} ${
              item === page
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {item}
          </Link>
        )
      )}

      {page < totalPages ? (
        <Link
          href={buildHref(query, page + 1)}
          className={`${baseLink} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
          rel="next"
        >
          Next
        </Link>
      ) : (
        <span className={`${baseLink} cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400`}>
          Next
        </span>
      )}
    </nav>
  );
}
