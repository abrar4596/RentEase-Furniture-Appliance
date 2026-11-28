'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ICity } from '@rentease/shared';
import { Button, Input, Modal, useToast } from '../ui';
import { AlertCircle, CheckCircle2, MapPin } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
const CITY_COOKIE = 'rentease_city';
const CITY_LABEL_COOKIE = 'rentease_city_label';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 6 months

interface ServiceabilityResult {
  serviceable: boolean;
  city: ICity | null;
  requestedPincode?: string;
}

function readCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

/**
 * Header city selector.
 *
 * Lets a visitor confirm we deliver to their pincode (definitive) or pick a city
 * (city-level). A serviceable match is persisted in a cookie and used as the
 * catalog's default location; an unserviceable one rolls straight into the
 * waitlist capture flow.
 */
export function CitySelector() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [label, setLabel] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [pincode, setPincode] = useState('');
  const [cityId, setCityId] = useState('');
  const [cities, setCities] = useState<ICity[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [mode, setMode] = useState<'check' | 'waitlist'>('check');

  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistCity, setWaitlistCity] = useState('');
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistPhone, setWaitlistPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setLabel(readCookie(CITY_LABEL_COOKIE));
  }, []);

  const openModal = () => {
    setMode('check');
    setIsOpen(true);
    if (cities.length === 0) {
      fetch(`${API_BASE}/cities`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setCities(data.data.cities as ICity[]);
        })
        .catch(() => undefined);
    }
  };

  const applyCity = (city: ICity) => {
    document.cookie = `${CITY_COOKIE}=${city.id}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    document.cookie = `${CITY_LABEL_COOKIE}=${encodeURIComponent(city.name)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
    setLabel(city.name);
    setIsOpen(false);
    success(`Now showing rentals in ${city.name}`, 'Location set');
    router.push(`/catalog?cityId=${city.id}`);
  };

  const checkServiceability = async () => {
    const trimmedPincode = pincode.trim();
    if (!trimmedPincode && !cityId) {
      toastError('Enter a pincode or pick a city first', 'Location');
      return;
    }
    setIsChecking(true);
    try {
      const query = trimmedPincode
        ? `pincode=${encodeURIComponent(trimmedPincode)}`
        : `cityId=${encodeURIComponent(cityId)}`;
      const res = await fetch(`${API_BASE}/cities/serviceability?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Could not check serviceability');

      const result = data.data as ServiceabilityResult;
      if (result.serviceable && result.city) {
        applyCity(result.city);
      } else {
        setWaitlistCity(trimmedPincode ? '' : (cities.find((c) => c.id === cityId)?.name ?? ''));
        setMode('waitlist');
      }
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : 'Could not check serviceability',
        'Location'
      );
    } finally {
      setIsChecking(false);
    }
  };

  const joinWaitlist = async () => {
    if (waitlistCity.trim().length < 2) {
      toastError('Please tell us your city', 'Waitlist');
      return;
    }
    if (!waitlistEmail.trim() && !waitlistPhone.trim()) {
      toastError('Add an email or a mobile number so we can reach you', 'Waitlist');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/cities/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cityName: waitlistCity.trim(),
          ...(pincode.trim() ? { pincode: pincode.trim() } : {}),
          ...(waitlistName.trim() ? { name: waitlistName.trim() } : {}),
          ...(waitlistEmail.trim() ? { email: waitlistEmail.trim() } : {}),
          ...(waitlistPhone.trim() ? { phone: waitlistPhone.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Could not join the waitlist');
      success("We'll let you know as soon as we launch near you", 'You’re on the list');
      setIsOpen(false);
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : 'Could not join the waitlist',
        'Waitlist'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-50 px-3.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand-500 sm:text-sm"
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        <span className="hidden xs:inline">City:</span>
        <span className="font-semibold text-gray-900">{label ?? 'Select City / Pincode'}</span>
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={mode === 'check' ? 'Where do you need rentals?' : 'Coming soon to your city'}
        description={
          mode === 'check'
            ? 'Check delivery serviceability by pincode or choose your city.'
            : "We don't deliver here yet — leave your details and we'll notify you at launch."
        }
      >
        {mode === 'check' ? (
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <Input
                label="Pincode"
                placeholder="e.g. 302001"
                inputMode="numeric"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              />
              <Button onClick={checkServiceability} isLoading={isChecking}>
                Check
              </Button>
            </div>

            <div className="flex items-center gap-3 text-xs uppercase text-gray-400">
              <span className="h-px flex-1 bg-gray-200" />
              or
              <span className="h-px flex-1 bg-gray-200" />
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Choose a city</span>
              <select
                className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
              >
                <option value="">Select a city</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}, {city.state}
                  </option>
                ))}
              </select>
            </label>

            <Button
              variant="outline"
              className="w-full"
              disabled={!cityId}
              isLoading={isChecking}
              onClick={checkServiceability}
            >
              Use this city
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {pincode.trim()
                  ? `We don't serve pincode ${pincode.trim()} yet.`
                  : "We don't serve this city yet."}{' '}
                Join the waitlist and we&apos;ll reach out when we launch.
              </span>
            </div>

            <Input
              label="Your city"
              placeholder="e.g. Nagpur"
              value={waitlistCity}
              onChange={(e) => setWaitlistCity(e.target.value)}
            />
            <Input
              label="Name (optional)"
              placeholder="Your name"
              value={waitlistName}
              onChange={(e) => setWaitlistName(e.target.value)}
            />
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={waitlistEmail}
              onChange={(e) => setWaitlistEmail(e.target.value)}
            />
            <Input
              label="Mobile (optional)"
              inputMode="numeric"
              placeholder="10-digit mobile"
              value={waitlistPhone}
              onChange={(e) => setWaitlistPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              helperText="Provide an email or a mobile number so we can notify you."
            />

            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setMode('check')} className="text-gray-600">
                Back
              </Button>
              <Button className="flex-1" isLoading={isSubmitting} onClick={joinWaitlist}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Notify me
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
