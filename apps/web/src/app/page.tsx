'use client';

import React, { useState } from 'react';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Modal,
  Skeleton,
  useToast,
} from '../components/ui';
import { Clock, ShieldCheck, Sparkles, Wrench, Search } from 'lucide-react';
import { formatINR } from '@rentease/shared';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [inputError, setInputError] = useState('');
  const { success, warning, info } = useToast();

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim()) {
      setInputError('Please enter a valid pincode or city name.');
      return;
    }
    setInputError('');
    success(`Checking catalog for pincode "${testInput}".`, 'Serviceability Query');
    router.push(`/catalog?pincode=${encodeURIComponent(testInput.trim())}`);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-12">
      {/* Hero Section */}
      <section className="text-center space-y-4 max-w-3xl mx-auto pt-4">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          Hyperlocal Rentals in Tier-2/Tier-3 Cities
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
          Furnish your room in <span className="text-brand-600">24–48 hours</span>.
        </h1>
        <p className="text-base text-gray-600 sm:text-lg">
          Connecting you with trusted local dealers in Jaipur, Indore, Lucknow, and beyond. Flexible
          1, 3, 6, or 12-month tenures with verified ₹0-deposit options.
        </p>

        {/* Pincode Search Demo */}
        <form onSubmit={handleTestSubmit} className="pt-4 max-w-md mx-auto flex gap-2">
          <Input
            placeholder="Enter Pincode (e.g. 302001)"
            value={testInput}
            onChange={(e) => {
              setTestInput(e.target.value);
              if (inputError) setInputError('');
            }}
            error={inputError}
            leftAddon={<Search className="h-4 w-4" />}
          />
          <Button type="submit" variant="primary">
            Check
          </Button>
        </form>
      </section>

      {/* Value Proposition Highlights */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md transition-shadow border-emerald-100">
          <CardHeader className="pb-3">
            <Clock className="h-6 w-6 text-brand-600 mb-1" />
            <CardTitle>24–48h Delivery</CardTitle>
            <CardDescription>
              Local dealer inventory means same-city doorstep delivery and professional setup.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-amber-100">
          <CardHeader className="pb-2">
            <ShieldCheck className="h-6 w-6 text-accent-500 mb-1" />
            <CardTitle>₹0 Deposit Deals</CardTitle>
            <CardDescription>Verified zero-deposit offers on high-demand items.</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              Starts at {formatINR(49900)}/mo
            </span>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-blue-100">
          <CardHeader className="pb-3">
            <Sparkles className="h-6 w-6 text-blue-600 mb-1" />
            <CardTitle>Flexible Tenures</CardTitle>
            <CardDescription>
              Choose 1, 3, 6, or 12-month plans with transparent dynamic tenure pricing.
            </CardDescription>
          </CardHeader>
        </Card>

        <Card className="hover:shadow-md transition-shadow border-purple-100">
          <CardHeader className="pb-3">
            <Wrench className="h-6 w-6 text-purple-600 mb-1" />
            <CardTitle>Free Maintenance</CardTitle>
            <CardDescription>
              Prompt doorstep repairs with an SLA target under 48 hours for total peace of mind.
            </CardDescription>
          </CardHeader>
        </Card>
      </section>

      {/* Phase 0 UI Kit & Quality Gate Verification Playground */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Phase 0 UI Kit & Design System Verification
          </h2>
          <p className="text-sm text-gray-500">
            Interactive verification of core UI components, design tokens, and shared money
            formatting.
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">Button Variants & Sizes</h3>
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
          <h3 className="text-sm font-semibold text-gray-700">Modals & Notifications</h3>
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
          <h3 className="text-sm font-semibold text-gray-700">Skeleton Loading Placeholders</h3>
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
