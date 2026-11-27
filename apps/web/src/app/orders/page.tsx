'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { Card, CardContent, Skeleton, Button, Modal, Input } from '../../components/ui';
import { IOrder, ProductImage, formatINR } from '@rentease/shared';
import { ImageUploader } from '../../components/vendor/ImageUploader';
import { useToast } from '../../components/ui/Toast';
import { PaymentDismissedError, loadRazorpay, openRazorpayCheckout } from '../../lib/razorpay';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function OrdersPage() {
  return (
    <ProtectedRoute allowedRoles={['renter']}>
      <OrdersContent />
    </ProtectedRoute>
  );
}

function OrdersContent() {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<IOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionOrder, setActionOrder] = useState<IOrder | null>(null);
  const [actionType, setActionType] = useState<'maintenance' | 'extend' | 'return' | null>(null);
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [maintenancePhotos, setMaintenancePhotos] = useState<ProductImage[]>([]);
  const [additionalMonths, setAdditionalMonths] = useState(1);
  const [pickupDate, setPickupDate] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/orders`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setOrders(data.data.orders);
      })
      .finally(() => setLoading(false));
  }, [accessToken]);
  const submitLifecycleAction = async () => {
    if (!actionOrder || !accessToken || !actionType) return;
    setSubmitting(true);
    try {
      const path =
        actionType === 'maintenance'
          ? `/${actionOrder.id}/maintenance`
          : actionType === 'extend'
            ? `/${actionOrder.id}/extend`
            : `/${actionOrder.id}/return`;
      const body =
        actionType === 'maintenance'
          ? {
              description: maintenanceDescription,
              photos: maintenancePhotos.map((photo) => ({
                publicId: photo.publicId,
                url: photo.url,
              })),
            }
          : actionType === 'extend'
            ? { additionalMonths }
            : { preferredPickupDate: pickupDate, reason: returnReason || undefined };
      const res = await fetch(`${API_BASE}/orders${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Action failed');
      setOrders((current) =>
        current.map((order) => (order.id === actionOrder.id ? data.data.order : order))
      );
      setActionOrder(null);
      setActionType(null);
      setMaintenanceDescription('');
      setMaintenancePhotos([]);
      setPickupDate('');
      setReturnReason('');
      success(
        'Updated',
        actionType === 'maintenance'
          ? 'Maintenance request submitted'
          : actionType === 'extend'
            ? 'Tenure extended'
            : 'Return pickup requested'
      );
    } catch (error) {
      toastError(
        'Action failed',
        error instanceof Error ? error.message : 'Could not update the rental'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const payForOrder = async (order: IOrder) => {
    if (!accessToken) return;
    setPayingOrderId(order.id);
    let paymentCaptured = false;
    try {
      // Re-open payment with the server's existing gateway order (never double-locks
      // stock) and refuse silently once the reservation has lapsed.
      const res = await fetch(`${API_BASE}/orders/${order.id}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not start payment');
      }
      const resumed = data.data.order as IOrder;
      const keyId = data.data.keyId as string;
      if (!resumed.razorpayOrderId) throw new Error('Payment could not be initialised');

      await loadRazorpay();
      const payment = await openRazorpayCheckout({
        key: keyId,
        amount: resumed.totalUpfrontPaise,
        currency: 'INR',
        name: 'RentEase',
        description: `Rental order #${resumed.id.slice(-8)}`,
        order_id: resumed.razorpayOrderId,
        prefill: {
          name: resumed.deliveryAddress.fullName,
          contact: resumed.deliveryAddress.phone,
        },
        theme: { color: '#10b981' },
      });
      paymentCaptured = true;

      const verifyRes = await fetch(`${API_BASE}/orders/${order.id}/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
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
      setOrders((current) =>
        current.map((entry) => (entry.id === order.id ? (verifyData.data.order as IOrder) : entry))
      );
      success('Payment successful', 'Complete your KYC to confirm the delivery');
    } catch (error) {
      if (error instanceof PaymentDismissedError) {
        toastError('Payment cancelled', 'You can retry any time before the reservation expires.');
      } else if (paymentCaptured) {
        toastError(
          'Confirming payment',
          'Your payment went through but confirmation is still pending. Refresh in a moment.'
        );
      } else {
        toastError(
          error instanceof Error ? error.message : 'Could not complete payment',
          'Payment'
        );
      }
    } finally {
      setPayingOrderId(null);
    }
  };

  const cancelOrder = async (order: IOrder) => {
    if (!accessToken) return;
    setCancellingOrderId(order.id);
    try {
      const res = await fetch(`${API_BASE}/orders/${order.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Could not cancel the order');
      }
      setOrders((current) =>
        current.map((entry) => (entry.id === order.id ? (data.data.order as IOrder) : entry))
      );
      success('Order cancelled', 'Your reserved items have been released');
    } catch (error) {
      toastError(error instanceof Error ? error.message : 'Could not cancel the order', 'Orders');
    } finally {
      setCancellingOrderId(null);
    }
  };

  if (loading)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Skeleton className="h-64 w-full" />
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">My orders</h1>
      {orders.length === 0 ? (
        <p className="text-sm text-gray-500">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-5">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="font-semibold">Order #{order.id.slice(-8)}</p>
                    <p className="text-sm text-gray-500">
                      {order.items.length} item(s) · {order.status}
                    </p>
                  </div>
                  <strong>{formatINR(order.totalUpfrontPaise)}</strong>
                </div>
                {order.razorpayOrderId && (
                  <p className="mt-2 text-xs text-gray-500">
                    Payment reference: {order.razorpayOrderId}
                  </p>
                )}
                {order.status === 'PENDING_PAYMENT' && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm text-amber-700">
                      Payment pending — your items are reserved until you complete payment.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        isLoading={payingOrderId === order.id}
                        disabled={cancellingOrderId === order.id}
                        onClick={() => payForOrder(order)}
                      >
                        Complete payment
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={cancellingOrderId === order.id}
                        disabled={payingOrderId === order.id}
                        onClick={() => cancelOrder(order)}
                      >
                        Cancel order
                      </Button>
                    </div>
                  </div>
                )}
                {(order.status === 'PENDING_KYC' || order.status === 'KYC_REJECTED') && (
                  <div className="mt-4">
                    {order.status === 'KYC_REJECTED' && (
                      <p className="mb-2 text-sm text-red-600">
                        Rejected: {order.kyc?.rejectionReason || 'Please resubmit KYC'}
                      </p>
                    )}
                    {order.status === 'PENDING_KYC' && order.kyc ? (
                      <p className="text-sm text-amber-700">
                        KYC documents submitted and pending review
                      </p>
                    ) : (
                      <Link href={`/kyc/${order.id}`}>
                        <Button size="sm">
                          {order.status === 'KYC_REJECTED' ? 'Resubmit KYC' : 'Complete KYC'}
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
                {order.status === 'ACTIVE' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActionOrder(order);
                        setActionType('maintenance');
                      }}
                    >
                      Request maintenance
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setActionOrder(order);
                        setActionType('extend');
                      }}
                    >
                      Extend tenure
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        setActionOrder(order);
                        setActionType('return');
                      }}
                    >
                      Request return
                    </Button>
                    {order.rentalEndAt && (
                      <span className="ml-auto self-center text-xs text-gray-500">
                        Ends {new Date(order.rentalEndAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                )}
                {order.status === 'RETURN_REQUESTED' && (
                  <p className="mt-3 text-sm text-amber-700">
                    Return pickup requested for {order.returnRequest?.preferredPickupDate}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {actionOrder && actionType && (
        <Modal
          isOpen
          onClose={() => {
            setActionOrder(null);
            setActionType(null);
          }}
          title={
            actionType === 'maintenance'
              ? 'Request maintenance'
              : actionType === 'extend'
                ? 'Extend tenure'
                : 'Schedule return pickup'
          }
        >
          <div className="space-y-4">
            {actionType === 'maintenance' && (
              <>
                <Input
                  label="Issue description"
                  value={maintenanceDescription}
                  onChange={(e) => setMaintenanceDescription(e.target.value)}
                  placeholder="Describe the repair needed"
                />
                <div>
                  <p className="mb-2 text-sm font-medium">Photos (optional)</p>
                  <ImageUploader
                    images={maintenancePhotos}
                    onChange={setMaintenancePhotos}
                    maxImages={5}
                    uploadFolder="maintenance"
                  />
                </div>
              </>
            )}
            {actionType === 'extend' && (
              <div>
                <label className="mb-1 block text-sm font-medium">Additional months</label>
                <select
                  value={additionalMonths}
                  onChange={(e) => setAdditionalMonths(Number(e.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {[1, 3, 6, 12].map((months) => (
                    <option key={months} value={months}>
                      {months} month(s)
                    </option>
                  ))}
                </select>
              </div>
            )}
            {actionType === 'return' && (
              <>
                <Input
                  label="Preferred pickup date"
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                />
                <Input
                  label="Reason (optional)"
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                />
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setActionOrder(null);
                  setActionType(null);
                }}
              >
                Cancel
              </Button>
              <Button onClick={submitLifecycleAction} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
