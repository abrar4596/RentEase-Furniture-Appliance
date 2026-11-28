'use client';

import React, { useState } from 'react';
import { ProductImage } from '@rentease/shared';
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/Toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

// Mock/demo affordances (fake Cloudinary responses, sample photos) must never run in production.
const isDev = process.env.NODE_ENV !== 'production';

interface ImageUploaderProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  maxImages?: number;
  uploadFolder?: 'products' | 'kyc' | 'maintenance';
}

export function ImageUploader({
  images,
  onChange,
  maxImages = 5,
  uploadFolder = 'products',
}: ImageUploaderProps) {
  const { accessToken } = useAuth();
  const { error: toastError, success: toastSuccess } = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toastError('Only image files (JPG, PNG, WEBP) are supported');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toastError('Image size must be less than 5 MB');
      return;
    }

    if (images.length >= maxImages) {
      toastError(`You can upload at most ${maxImages} images`);
      return;
    }

    setIsUploading(true);

    try {
      // 1. Request signed upload signature from backend
      const sigRes = await fetch(`${API_BASE}/uploads/signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ folder: uploadFolder }),
      });

      const sigData = await sigRes.json();
      if (!sigRes.ok || !sigData.success) {
        throw new Error(sigData.error?.message || 'Failed to request upload signature');
      }

      const { signature, timestamp, apiKey, folder, cloudName, tags } = sigData.data;

      // 2. Upload directly to Cloudinary
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp.toString());
      formData.append('signature', signature);
      formData.append('folder', folder);
      if (tags) formData.append('tags', tags.join(','));

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      const uploadResult = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadResult.error?.message || 'Cloudinary upload failed');
      }

      const newImage: ProductImage = {
        publicId: uploadResult.public_id,
        url: uploadResult.secure_url,
        thumbnailUrl: uploadResult.secure_url.replace('/upload/', '/upload/c_thumb,w_200,h_200/'),
      };

      onChange([...images, newImage]);
      toastSuccess('Image uploaded successfully');
    } catch (err: unknown) {
      if (isDev) {
        // Local development may run without Cloudinary credentials: fall back to a sample photo.
        const fallbackPublicId = `mock_img_${Date.now()}`;
        const fallbackUrl = `https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80`;
        onChange([...images, { publicId: fallbackPublicId, url: fallbackUrl }]);
        toastSuccess('Sample product photo added (development mock mode)');
      } else {
        toastError(
          err instanceof Error ? err.message : 'Image upload failed. Please try again.',
          'Upload failed'
        );
      }
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleAddSamplePhoto = () => {
    if (images.length >= maxImages) {
      toastError(`Maximum ${maxImages} images allowed`);
      return;
    }
    const sampleUrls = [
      'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=600&q=80', // Sofa
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=600&q=80', // Bed
      'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=600&q=80', // Chair
      'https://images.unsplash.com/photo-1584992236310-6edddc08acff?auto=format&fit=crop&w=600&q=80', // Appliance
    ];
    const picked = sampleUrls[images.length % sampleUrls.length]!;
    const newImage: ProductImage = {
      publicId: `sample_${Date.now()}`,
      url: picked,
    };
    onChange([...images, newImage]);
  };

  const removeImage = (indexToRemove: number) => {
    onChange(images.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Product Images ({images.length}/{maxImages})
      </label>

      {/* Image Grid */}
      <div className="flex flex-wrap gap-3">
        {images.map((img, idx) => (
          <div
            key={img.publicId || idx}
            className="relative h-24 w-24 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 shadow-sm group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={`Upload ${idx + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => removeImage(idx)}
              className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80 transition-colors"
              aria-label="Remove image"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {images.length < maxImages && (
          <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-brand-500 hover:bg-brand-50/30 transition-colors">
            {isUploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-gray-400 mb-1" />
                <span className="text-[11px] font-medium text-gray-600">Upload</span>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
              disabled={isUploading}
            />
          </label>
        )}
      </div>

      {isDev && images.length === 0 && (
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleAddSamplePhoto}
            className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            Insert demo photo
          </button>
        </div>
      )}
    </div>
  );
}
