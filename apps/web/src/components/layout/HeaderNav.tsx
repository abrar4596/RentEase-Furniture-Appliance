'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { User, LogOut, Store, Shield, ShoppingCart } from 'lucide-react';
import { Button } from '../ui/Button';
import { CitySelector } from './CitySelector';

export function HeaderNav() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo & Brand */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 font-black text-white shadow-sm group-hover:bg-brand-700 transition-colors">
            RE
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-gray-900 leading-tight">
              RentEase
            </span>
            <span className="text-[11px] font-medium text-gray-500 tracking-wide uppercase">
              Tier-2/3 Hyperlocal Rentals
            </span>
          </div>
        </Link>

        {/* Center: City Selector Pill & Portal Quick Links */}
        <div className="flex items-center gap-3">
          <CitySelector />

          {user?.role === 'vendor' && (
            <Link href="/vendor/dashboard">
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-1.5 text-xs text-brand-700 border-brand-200 hover:bg-brand-50"
              >
                <Store className="h-3.5 w-3.5 text-brand-600" />
                <span>Vendor Dashboard</span>
              </Button>
            </Link>
          )}

          {user?.role === 'admin' && (
            <>
              <Link href="/admin">
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                >
                  <Shield className="h-3.5 w-3.5 text-amber-600" />
                  <span>Console</span>
                </Button>
              </Link>
              <Link href="/admin/vendors">
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                >
                  <Shield className="h-3.5 w-3.5 text-amber-600" />
                  <span>Vendors</span>
                </Button>
              </Link>
              <Link href="/admin/kyc">
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                >
                  <Shield className="h-3.5 w-3.5 text-amber-600" />
                  <span>KYC</span>
                </Button>
              </Link>
              <Link href="/admin/payouts">
                <Button
                  variant="outline"
                  size="sm"
                  className="hidden sm:flex items-center gap-1.5 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                >
                  <Shield className="h-3.5 w-3.5 text-amber-600" />
                  <span>Payouts</span>
                </Button>
              </Link>
            </>
          )}
        </div>

        {/* Right: Auth State & Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              {user.role === 'renter' && (
                <Link href="/cart">
                  <Button variant="ghost" size="sm" className="flex items-center gap-1.5 text-xs">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="hidden sm:inline">Cart</span>
                  </Button>
                </Link>
              )}
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-semibold text-gray-900 leading-tight">
                  {user.name}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 capitalize">
                  {user.role === 'admin' && <Shield className="h-3 w-3" />}
                  {user.role === 'vendor' && <Store className="h-3 w-3" />}
                  {user.role}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => logout()}
                className="flex items-center gap-1.5 text-xs"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-xs sm:text-sm">
                  <User className="h-4 w-4 mr-1 sm:mr-1.5" />
                  Sign In
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="primary" size="sm" className="text-xs sm:text-sm">
                  Register
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
