'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Modal, Skeleton, useToast } from '../ui';
import { formatINR } from '@rentease/shared';
import { ArrowLeft } from 'lucide-react';

export function UiKitPlayground() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { success, warning, info } = useToast();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-800 mb-2">
            Non-Production Dev Route
          </span>
          <h1 className="text-2xl font-bold text-gray-900">
            Phase 0 UI Kit &amp; Design System Verification
          </h1>
          <p className="text-sm text-gray-500">
            Interactive verification of core UI components, design tokens, and shared money
            formatting.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Storefront
        </Link>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 space-y-6">
        {/* Buttons */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Button Variants &amp; Sizes</h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="primary">Primary Action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="primary" isLoading>
              Loading
            </Button>
          </div>
        </div>

        {/* Modal & Toast Triggers */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Modals &amp; Notifications</h2>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setIsModalOpen(true)}>
              Open Verification Modal
            </Button>
            <Button
              variant="secondary"
              onClick={() => success('Payment completed successfully!', 'Order Confirmed')}
            >
              Test Success Toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => warning('Delivery slot approaching capacity', 'Capacity Warning')}
            >
              Test Warning Toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => info('KYC review typically completes in under 2 hours', 'Info')}
            >
              Test Info Toast
            </Button>
          </div>
        </div>

        {/* Skeleton Loaders */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Skeleton Loading Placeholders</h2>
          <div className="space-y-2 max-w-sm">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </section>

      {/* Verification Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="RentEase UI Verification Modal"
        description="This modal tests accessibility, keyboard focus trap, escape key handling, and mobile overlay."
      >
        <div className="space-y-4 py-2">
          <p className="text-sm text-gray-600">
            The foundation for RentEase is active with shared types, money utilities, error
            handlers, and mobile-first responsive design tokens.
          </p>
          <div className="rounded-lg bg-gray-50 p-3 border border-gray-200 text-xs font-mono text-gray-700">
            Formatted Sample Rent: {formatINR(149900)}/mo | Deposit: {formatINR(0)} (Free Deposit)
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setIsModalOpen(false);
                success('Modal action confirmed');
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
