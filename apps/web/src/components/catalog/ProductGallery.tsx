'use client';

import React, { useState } from 'react';
import { ProductImage } from '@rentease/shared';
import { cn } from '../../lib/utils';

/**
 * Product image gallery. The main image follows the selected thumbnail; when
 * only one image exists the thumbnail strip is omitted entirely.
 */
export function ProductGallery({ images, title }: { images: ProductImage[]; title: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex] ?? images[0];

  if (images.length === 0) {
    return (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-400">
        No image available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {active?.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={active.url} alt={title} className="h-[420px] w-full object-cover" />
        ) : (
          <div className="flex h-[420px] items-center justify-center text-gray-400">
            No image available
          </div>
        )}
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((image, index) => (
            <button
              key={image.publicId || index}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`View image ${index + 1} of ${images.length}`}
              aria-current={index === activeIndex}
              className={cn(
                'h-20 overflow-hidden rounded-lg border-2 transition-colors',
                index === activeIndex
                  ? 'border-brand-600'
                  : 'border-transparent hover:border-gray-300'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.thumbnailUrl || image.url}
                alt=""
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
