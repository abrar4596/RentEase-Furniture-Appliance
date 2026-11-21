'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { Button, Card, CardContent, Input, Skeleton, useToast } from '../../components/ui';
import { Cart, formatINR, calculateUpfrontDue } from '@rentease/shared';
import { Trash2, ShoppingBag } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function CartPage() {
  return (
    <ProtectedRoute allowedRoles={['renter']}>
      <CartContent />
    </ProtectedRoute>
  );
}

function CartContent() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const { success, error: toastError } = useToast();
  const [cart, setCart] = useState<Cart | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<'morning' | 'afternoon' | 'evening'>('morning');

  const fetchCart = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/cart`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (data.success) setCart(data.data.cart);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  const updateQuantity = async (productId: string, quantity: number) => {
    if (!accessToken) return;
    await fetch(`${API_BASE}/cart/items/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ quantity }),
    });
    await fetchCart();
  };

  const removeItem = async (productId: string) => {
    if (!accessToken) return;
    await fetch(`${API_BASE}/cart/items/${productId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    success('Item removed', 'Cart');
    await fetchCart();
  };

  const checkout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/orders/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          deliveryAddress: { fullName, phone, line1, city, state, pincode },
          preferredDeliveryDate: date,
          preferredDeliverySlot: slot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Checkout failed');
      success('Order created', 'Payment');
      router.push('/orders');
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Checkout failed', 'Checkout');
    }
  };

  const subtotal =
    cart?.items.reduce((sum, item) => sum + item.monthlyRentPaise * item.quantity, 0) ?? 0;
  const deposit =
    cart?.items.reduce((sum, item) => sum + item.securityDepositPaise * item.quantity, 0) ?? 0;
  const upfront = subtotal > 0 ? calculateUpfrontDue(subtotal, deposit) : 0;

  if (isLoading)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>
      {!cart || cart.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-semibold">Your cart is empty</p>
          <Link href="/catalog">
            <Button className="mt-4">Browse catalog</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            {cart.items.map((item) => (
              <Card key={item.productId}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="text-sm text-gray-500">
                      {item.tenureMonths} months · {formatINR(item.monthlyRentPaise)}/mo
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      className="rounded border px-2 py-1"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.productId, Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5].map((quantity) => (
                        <option key={quantity} value={quantity}>
                          {quantity}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.productId)}
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="space-y-4 p-5">
              <h2 className="font-semibold">Delivery & payment</h2>
              <form className="space-y-3" onSubmit={checkout}>
                <Input
                  placeholder="Full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
                <Input
                  placeholder="Mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
                <Input
                  placeholder="Address"
                  value={line1}
                  onChange={(e) => setLine1(e.target.value)}
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="City"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                  />
                  <Input
                    placeholder="State"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    required
                  />
                </div>
                <Input
                  placeholder="Pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  required
                />
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                <select
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={slot}
                  onChange={(e) => setSlot(e.target.value as typeof slot)}
                >
                  <option value="morning">Morning</option>
                  <option value="afternoon">Afternoon</option>
                  <option value="evening">Evening</option>
                </select>
                <div className="border-t pt-3 text-sm">
                  <div className="flex justify-between">
                    <span>Monthly rent</span>
                    <strong>{formatINR(subtotal)}</strong>
                  </div>
                  <div className="mt-1 flex justify-between">
                    <span>Security deposit</span>
                    <strong>{formatINR(deposit)}</strong>
                  </div>
                  <div className="mt-3 flex justify-between text-base">
                    <span className="font-semibold">Pay upfront</span>
                    <strong>{formatINR(upfront)}</strong>
                  </div>
                </div>
                <Button type="submit" className="w-full">
                  Create order
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
