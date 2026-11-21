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
import { Lock, KeyRound } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function ResetPasswordPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Password reset failed.');
      }

      success('Password reset successfully! Please log in.', 'Success');
      router.push('/login');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error resetting password';
      setErrorMsg(message);
      toastError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md shadow-lg border-gray-200">
        <CardHeader className="text-center space-y-1">
          <CardTitle className="text-2xl font-bold">Set a new password</CardTitle>
          <CardDescription>
            Enter the recovery token dispatched to your email and your new password.
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

            <Input
              label="Reset Token"
              placeholder="Paste token from email"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              leftAddon={<KeyRound className="h-4 w-4" />}
            />

            <Input
              label="New Password"
              type="password"
              placeholder="At least 8 characters"
              required
              helperText="Must contain at least 8 characters, 1 uppercase, 1 lowercase, 1 number"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              leftAddon={<Lock className="h-4 w-4" />}
            />

            <Input
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftAddon={<Lock className="h-4 w-4" />}
            />

            <Button type="submit" variant="primary" className="w-full" isLoading={isLoading}>
              Update Password
            </Button>
          </form>
        </CardContent>

        <CardFooter className="justify-center border-t border-gray-100 py-4">
          <p className="text-xs text-gray-600">
            Remembered your password?{' '}
            <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
