'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Button,
  Input,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  useToast,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { Lock, Mail, User as UserIcon, Phone, Store, UserCheck } from 'lucide-react';
import { USER_ROLES, UserRole } from '@rentease/shared';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const { success, error: toastError } = useToast();

  const [role, setRole] = useState<UserRole>(USER_ROLES.RENTER);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      await register({
        name,
        email,
        phone: phone || undefined,
        password,
        role: role as typeof USER_ROLES.RENTER | typeof USER_ROLES.VENDOR,
      });

      success(
        role === USER_ROLES.VENDOR
          ? 'Vendor account created! Pending admin review.'
          : 'Account created successfully!',
        'Welcome to RentEase'
      );
      router.push('/');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setErrorMsg(message);
      toastError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-lg shadow-lg border-gray-200">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold">Create your RentEase account</CardTitle>
          <CardDescription>
            Join thousands renting quality furniture and appliances in Tier-2/Tier-3 cities.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-800 border border-red-200"
              >
                {errorMsg}
              </div>
            )}

            {/* Account Type Selection */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Account Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRole(USER_ROLES.RENTER)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3.5 transition-all text-center ${
                    role === USER_ROLES.RENTER
                      ? 'border-brand-600 bg-brand-50/50 text-brand-900 ring-2 ring-brand-500'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <UserCheck className="h-5 w-5 mb-1 text-brand-600" />
                  <span className="text-sm font-bold">I am a Renter</span>
                  <span className="text-[11px] text-gray-500">Student / Working Professional</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole(USER_ROLES.VENDOR)}
                  className={`flex flex-col items-center justify-center rounded-xl border p-3.5 transition-all text-center ${
                    role === USER_ROLES.VENDOR
                      ? 'border-brand-600 bg-brand-50/50 text-brand-900 ring-2 ring-brand-500'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Store className="h-5 w-5 mb-1 text-brand-600" />
                  <span className="text-sm font-bold">I am a Local Vendor</span>
                  <span className="text-[11px] text-gray-500">Retailer / Appliance Dealer</span>
                </button>
              </div>
            </div>

            <Input
              label={role === USER_ROLES.VENDOR ? 'Business / Contact Name' : 'Full Name'}
              placeholder={role === USER_ROLES.VENDOR ? 'Jaipur Furniture Hub' : 'Rahul Sharma'}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              leftAddon={<UserIcon className="h-4 w-4" />}
            />

            <Input
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftAddon={<Mail className="h-4 w-4" />}
            />

            <Input
              label="Mobile Number (Optional)"
              type="tel"
              placeholder="9876543210"
              helperText="10-digit Indian phone number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              leftAddon={<Phone className="h-4 w-4" />}
            />

            <Input
              label="Password"
              type="password"
              placeholder="At least 8 characters"
              required
              helperText="Must contain at least 8 characters, 1 uppercase, 1 lowercase, and 1 number"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftAddon={<Lock className="h-4 w-4" />}
            />

            <Button type="submit" variant="primary" className="w-full mt-2" isLoading={isLoading}>
              Create {role === USER_ROLES.VENDOR ? 'Vendor' : 'Renter'} Account
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t border-gray-100 py-4">
          <p className="text-xs text-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
