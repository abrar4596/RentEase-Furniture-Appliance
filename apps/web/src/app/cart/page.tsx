'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { Button, Card, CardContent, Input, Modal, Skeleton, useToast } from '../../components/ui';
import {
  Cart,
  DeliverySlot,
  DeliverySlotsView,
  IAddress,
  IOrder,
  formatINR,
} from '@rentease/shared';
import { MapPin, Plus, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PaymentDismissedError, loadRazorpay, openRazorpayCheckout } from '../../lib/razorpay';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

const TENURE_OPTIONS = [1, 3, 6, 12] as const;
const QUANTITY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Local (device timezone) calendar date as YYYY-MM-DD, matching the server format. */
function todayIso(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

interface AddressFormState {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

const EMPTY_ADDRESS: AddressFormState = {
  label: '',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
  isDefault: false,
};

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
  const [pendingItem, setPendingItem] = useState<string | null>(null);

  const [addresses, setAddresses] = useState<IAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressFormState>(EMPTY_ADDRESS);
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  const [date, setDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<DeliverySlot | null>(null);
  const [slotView, setSlotView] = useState<DeliverySlotsView | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const dateTouchedRef = useRef(false);

  const authHeaders = useMemo(
    () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken ?? ''}` }),
    [accessToken]
  );

  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId]
  );

  const fetchCart = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/cart`, { headers: authHeaders });
      const data = await res.json();
      if (data.success) setCart(data.data.cart);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, authHeaders]);

  const loadAddresses = useCallback(async (): Promise<IAddress[]> => {
    if (!accessToken) return [];
    const res = await fetch(`${API_BASE}/addresses`, { headers: authHeaders });
    const data = await res.json();
    const list: IAddress[] = data.success ? data.data.addresses : [];
    setAddresses(list);
    return list;
  }, [accessToken, authHeaders]);

  useEffect(() => {
    fetchCart();
  }, [fetchCart]);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  // Keep a sensible address selected: default first, then oldest, unless the user chose one.
  useEffect(() => {
    if (addresses.length === 0) {
      setSelectedAddressId(null);
      return;
    }
    if (selectedAddressId && addresses.some((address) => address.id === selectedAddressId)) {
      return;
    }
    const fallback = addresses.find((address) => address.isDefault) ?? addresses[0];
    if (fallback) setSelectedAddressId(fallback.id);
  }, [addresses, selectedAddressId]);

  // Seed the delivery date once an address is chosen.
  useEffect(() => {
    if (selectedAddress && !date) setDate(todayIso());
  }, [selectedAddress, date]);

  // Live slot availability for the selected pincode + date.
  useEffect(() => {
    const pincode = selectedAddress?.pincode;
    if (!pincode || !date || !accessToken) {
      setSlotView(null);
      return;
    }
    let cancelled = false;
    setIsLoadingSlots(true);
    fetch(`${API_BASE}/cart/delivery/slots?pincode=${pincode}&date=${date}`, {
      headers: authHeaders,
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          const view = data.data.slots as DeliverySlotsView;
          setSlotView(view);
          // If the picked date is before the vendor lead time allows, advance to the
          // earliest realistic date — but only while the user hasn't chosen one.
          if (!dateTouchedRef.current && date < view.earliestEligibleDate) {
            setDate(view.earliestEligibleDate);
          }
        } else {
          setSlotView(null);
          toastError(data.error?.message || 'Could not load delivery slots', 'Delivery');
        }
      })
      .catch(() => {
        if (!cancelled) setSlotView(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAddress?.pincode, date, accessToken, authHeaders, toastError]);

  // Never leave a stale/invalid slot selected after availability changes.
  useEffect(() => {
    if (!slotView) return;
    const current = slotView.slots.find((option) => option.slot === selectedSlot);
    if (current?.available) return;
    const firstAvailable = slotView.slots.find((option) => option.available);
    setSelectedSlot(firstAvailable ? firstAvailable.slot : null);
  }, [slotView, selectedSlot]);

  const updateItem = async (
    productId: string,
    patch: { quantity?: number; tenureMonths?: number }
  ) => {
    if (!accessToken) return;
    setPendingItem(productId);
    try {
      const res = await fetch(`${API_BASE}/cart/items/${productId}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not update the item');
      }
      setCart(data.data.cart);
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Could not update the item', 'Cart');
    } finally {
      setPendingItem(null);
    }
  };

  const removeItem = async (productId: string) => {
    if (!accessToken) return;
    setPendingItem(productId);
    try {
      const res = await fetch(`${API_BASE}/cart/items/${productId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not remove the item');
      }
      setCart(data.data.cart);
      success('Item removed', 'Cart');
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Could not remove the item', 'Cart');
    } finally {
      setPendingItem(null);
    }
  };

  const createAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessToken) return;
    setIsSavingAddress(true);
    try {
      const res = await fetch(`${API_BASE}/addresses`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          fullName: addressForm.fullName.trim(),
          phone: addressForm.phone.trim(),
          line1: addressForm.line1.trim(),
          line2: addressForm.line2.trim() || undefined,
          city: addressForm.city.trim(),
          state: addressForm.state.trim(),
          pincode: addressForm.pincode.trim(),
          label: addressForm.label.trim() || undefined,
          isDefault: addressForm.isDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not save the address');
      }
      const created = data.data.address as IAddress;
      await loadAddresses();
      setSelectedAddressId(created.id);
      setIsAddressModalOpen(false);
      setAddressForm(EMPTY_ADDRESS);
      success('Address saved', 'Delivery');
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Could not save the address', 'Delivery');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const deleteAddress = async (addressId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/addresses/${addressId}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not remove the address');
      }
      if (selectedAddressId === addressId) setSelectedAddressId(null);
      await loadAddresses();
      success('Address removed', 'Delivery');
    } catch (error) {
      toastError(
        error instanceof Error ? error.message : 'Could not remove the address',
        'Delivery'
      );
    }
  };

  const checkout = async () => {
    if (!accessToken) return;
    if (!selectedAddress) {
      toastError('Add or select a delivery address', 'Delivery');
      return;
    }
    if (!date || !selectedSlot) {
      toastError('Choose a delivery date and time slot', 'Delivery');
      return;
    }
    setIsCheckingOut(true);
    let order: IOrder | null = null;
    let paymentCaptured = false;
    try {
      const res = await fetch(`${API_BASE}/orders/checkout`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          deliveryAddress: {
            fullName: selectedAddress.fullName,
            phone: selectedAddress.phone,
            line1: selectedAddress.line1,
            line2: selectedAddress.line2,
            city: selectedAddress.city,
            state: selectedAddress.state,
            pincode: selectedAddress.pincode,
          },
          preferredDeliveryDate: date,
          preferredDeliverySlot: selectedSlot,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Checkout failed');
      }
      order = data.data.order as IOrder;
      const keyId = data.data.keyId as string;
      if (!order.razorpayOrderId) throw new Error('Payment could not be initialised');

      // Stock is reserved server-side; open the gateway. If the renter closes the
      // modal the order stays PENDING_PAYMENT and is resumable from My orders.
      await loadRazorpay();
      const payment = await openRazorpayCheckout({
        key: keyId,
        amount: order.totalUpfrontPaise,
        currency: 'INR',
        name: 'RentEase',
        description: `Rental order #${order.id.slice(-8)}`,
        order_id: order.razorpayOrderId,
        prefill: { name: selectedAddress.fullName, contact: selectedAddress.phone },
        theme: { color: '#10b981' },
      });
      paymentCaptured = true;

      const verifyRes = await fetch(`${API_BASE}/orders/${order.id}/verify-payment`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          razorpay_order_id: payment.razorpay_order_id,
          razorpay_payment_id: payment.razorpay_payment_id,
          razorpay_signature: payment.razorpay_signature,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        throw new Error(verifyData.error?.message || 'Payment confirmation failed');
      }
      success('Payment successful', 'Complete your KYC to confirm the delivery');
      router.push('/orders');
    } catch (error) {
      if (error instanceof PaymentDismissedError) {
        toastError(
          'Payment was not completed. Your order is saved — finish payment from My orders.',
          'Payment cancelled'
        );
        router.push('/orders');
        return;
      }
      if (paymentCaptured && order) {
        toastError(
          'Your payment went through but confirmation is still pending. Check My orders shortly.',
          'Confirming payment'
        );
        router.push('/orders');
        return;
      }
      toastError(error instanceof Error ? error.message : 'Checkout failed', 'Checkout');
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const isCartEmpty = !cart || cart.items.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="mb-6 text-2xl font-bold">Your cart</h1>
      {isCartEmpty ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center">
          <ShoppingBag className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 font-semibold">Your cart is empty</p>
          <Link href="/catalog">
            <Button className="mt-4">Browse catalog</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            {cart.vendorGroups.map((group) => (
              <Card key={group.vendorId}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-900">
                      {group.vendorBusinessName ?? 'Rental partner'}
                    </p>
                    <span className="text-xs text-gray-500">
                      {group.items.length} item{group.items.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {group.items.map((item) => (
                      <div
                        key={item.productId}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          {item.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt={item.title ?? 'Cart item'}
                              className="h-12 w-12 rounded object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">
                              {item.title ?? 'Product'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {formatINR(item.monthlyRentPaise)}/mo · line total{' '}
                              {formatINR(item.lineTotalPaise)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label="Quantity"
                            className="rounded border px-2 py-1 text-sm"
                            value={item.quantity}
                            disabled={pendingItem === item.productId}
                            onChange={(event) =>
                              updateItem(item.productId, { quantity: Number(event.target.value) })
                            }
                          >
                            {QUANTITY_OPTIONS.map((quantity) => (
                              <option key={quantity} value={quantity}>
                                {quantity}
                              </option>
                            ))}
                          </select>
                          <select
                            aria-label="Tenure"
                            className="rounded border px-2 py-1 text-sm"
                            value={item.tenureMonths}
                            disabled={pendingItem === item.productId}
                            onChange={(event) =>
                              updateItem(item.productId, {
                                tenureMonths: Number(event.target.value),
                              })
                            }
                          >
                            {TENURE_OPTIONS.map((months) => (
                              <option key={months} value={months}>
                                {months} mo
                              </option>
                            ))}
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pendingItem === item.productId}
                            onClick={() => removeItem(item.productId)}
                            aria-label="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between border-t border-gray-100 pt-2 text-sm">
                    <span className="text-gray-600">Sub-order total</span>
                    <strong>{formatINR(group.totalUpfrontPaise)}</strong>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <MapPin className="h-4 w-4 text-brand-600" />
                    Delivery address
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAddressModalOpen(true)}
                    aria-label="Add a new address"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {addresses.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No saved addresses yet. Add one to schedule delivery.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {addresses.map((address) => (
                      <label
                        key={address.id}
                        className={cn(
                          'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors',
                          selectedAddressId === address.id
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-gray-200 hover:border-gray-300'
                        )}
                      >
                        <input
                          type="radio"
                          name="delivery-address"
                          className="mt-1"
                          checked={selectedAddressId === address.id}
                          onChange={() => setSelectedAddressId(address.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2 font-medium text-gray-900">
                            {address.fullName}
                            {address.isDefault && (
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
                                Default
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-gray-600">
                            {address.line1}
                            {address.line2 ? `, ${address.line2}` : ''}, {address.city},{' '}
                            {address.state} {address.pincode}
                          </span>
                          <span className="mt-0.5 block text-gray-500">{address.phone}</span>
                        </span>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            deleteAddress(address.id);
                          }}
                          aria-label="Remove address"
                          className="rounded p-1 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </label>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-5">
                <h2 className="flex items-center gap-2 font-semibold">
                  <Truck className="h-4 w-4 text-brand-600" />
                  Delivery schedule
                </h2>
                {!selectedAddress ? (
                  <p className="text-sm text-gray-500">
                    Select a delivery address to see available slots.
                  </p>
                ) : (
                  <>
                    <Input
                      type="date"
                      label="Delivery date"
                      value={date}
                      min={slotView?.earliestEligibleDate ?? todayIso()}
                      onChange={(event) => {
                        dateTouchedRef.current = true;
                        setDate(event.target.value);
                      }}
                    />
                    {slotView && (
                      <p className="text-xs text-gray-500">
                        Earliest available delivery: {slotView.earliestEligibleDate}
                      </p>
                    )}
                    {isLoadingSlots ? (
                      <Skeleton className="h-28 w-full" />
                    ) : slotView && slotView.slots.length > 0 ? (
                      <div className="space-y-2">
                        {slotView.blackout && (
                          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                            No deliveries are scheduled on this date. Please pick another day.
                          </p>
                        )}
                        {slotView.slots.map((option) => (
                          <label
                            key={option.slot}
                            className={cn(
                              'flex items-center justify-between gap-3 rounded-lg border p-3 text-sm transition-colors',
                              !option.available
                                ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                                : selectedSlot === option.slot
                                  ? 'cursor-pointer border-brand-500 bg-brand-50'
                                  : 'cursor-pointer border-gray-200 hover:border-gray-300'
                            )}
                          >
                            <span className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="delivery-slot"
                                disabled={!option.available}
                                checked={selectedSlot === option.slot}
                                onChange={() => setSelectedSlot(option.slot)}
                              />
                              <span className="font-medium">{option.label}</span>
                            </span>
                            <span className="text-xs">
                              {option.available
                                ? `${option.remaining} left`
                                : (option.reason ?? 'Unavailable')}
                            </span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        No delivery slots are available for this date.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-3 p-5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    Monthly rent ({cart.totals.unitCount} unit
                    {cart.totals.unitCount === 1 ? '' : 's'})
                  </span>
                  <strong>{formatINR(cart.totals.subtotalRentPaise)}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Refundable deposit</span>
                  <strong>{formatINR(cart.totals.securityDepositPaise)}</strong>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-3 text-base">
                  <span className="font-semibold">Pay upfront</span>
                  <strong className="text-brand-700">
                    {formatINR(cart.totals.totalUpfrontPaise)}
                  </strong>
                </div>
                <p className="text-xs text-gray-500">
                  First month rent + refundable deposit, payable today.
                </p>
                <Button
                  className="w-full"
                  isLoading={isCheckingOut}
                  disabled={!selectedAddress || !date || !selectedSlot}
                  onClick={checkout}
                >
                  Continue to payment
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Modal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        title="Add delivery address"
      >
        <form className="space-y-3" onSubmit={createAddress}>
          <Input
            label="Label (optional)"
            placeholder="Home, Office"
            value={addressForm.label}
            onChange={(event) => setAddressForm({ ...addressForm, label: event.target.value })}
          />
          <Input
            label="Full name"
            value={addressForm.fullName}
            onChange={(event) => setAddressForm({ ...addressForm, fullName: event.target.value })}
            required
          />
          <Input
            label="Mobile number"
            inputMode="numeric"
            placeholder="10-digit mobile"
            value={addressForm.phone}
            onChange={(event) => setAddressForm({ ...addressForm, phone: event.target.value })}
            required
          />
          <Input
            label="Address line 1"
            value={addressForm.line1}
            onChange={(event) => setAddressForm({ ...addressForm, line1: event.target.value })}
            required
          />
          <Input
            label="Address line 2 (optional)"
            value={addressForm.line2}
            onChange={(event) => setAddressForm({ ...addressForm, line2: event.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="City"
              value={addressForm.city}
              onChange={(event) => setAddressForm({ ...addressForm, city: event.target.value })}
              required
            />
            <Input
              label="State"
              value={addressForm.state}
              onChange={(event) => setAddressForm({ ...addressForm, state: event.target.value })}
              required
            />
          </div>
          <Input
            label="Pincode"
            inputMode="numeric"
            placeholder="6-digit pincode"
            value={addressForm.pincode}
            onChange={(event) => setAddressForm({ ...addressForm, pincode: event.target.value })}
            required
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={addressForm.isDefault}
              onChange={(event) =>
                setAddressForm({ ...addressForm, isDefault: event.target.checked })
              }
            />
            Set as my default address
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsAddressModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSavingAddress}>
              Save address
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
