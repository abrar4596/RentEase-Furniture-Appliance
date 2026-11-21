'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { Card, CardContent, Skeleton, Button, Modal, Input } from '../../components/ui';
import { IOrder, ProductImage, formatINR } from '@rentease/shared';
import { ImageUploader } from '../../components/vendor/ImageUploader';
import { useToast } from '../../components/ui/Toast';

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
  const [selectedOrder, setSelectedOrder] = useState<IOrder | null>(null);
  const [documentType, setDocumentType] = useState<
    'AADHAR' | 'PAN' | 'DL' | 'PASSPORT' | 'VOTER_ID'
  >('AADHAR');
  const [documentNumber, setDocumentNumber] = useState('');
  const [front, setFront] = useState<ProductImage[]>([]);
  const [back, setBack] = useState<ProductImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [actionOrder, setActionOrder] = useState<IOrder | null>(null);
  const [actionType, setActionType] = useState<'maintenance' | 'extend' | 'return' | null>(null);
  const [maintenanceDescription, setMaintenanceDescription] = useState('');
  const [maintenancePhotos, setMaintenancePhotos] = useState<ProductImage[]>([]);
  const [additionalMonths, setAdditionalMonths] = useState(1);
  const [pickupDate, setPickupDate] = useState('');
  const [returnReason, setReturnReason] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    fetch(`${API_BASE}/orders`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setOrders(data.data.orders);
      })
      .finally(() => setLoading(false));
  }, [accessToken]);

  const submitKyc = async () => {
    if (!selectedOrder || !accessToken || !front[0]) {
      toastError('KYC incomplete', 'Add a front document image and document number');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/orders/${selectedOrder.id}/kyc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          documentType,
          documentNumber,
          frontDocument: { publicId: front[0].publicId, url: front[0].url },
          backDocument: back[0] ? { publicId: back[0].publicId, url: back[0].url } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Failed to submit KYC');
      setOrders((current) =>
        current.map((order) => (order.id === selectedOrder.id ? data.data.order : order))
      );
      setSelectedOrder(null);
      setDocumentNumber('');
      setFront([]);
      setBack([]);
      success('KYC submitted', 'Your documents are pending admin review');
    } catch (error) {
      toastError(
        'Submission failed',
        error instanceof Error ? error.message : 'Could not submit KYC'
      );
    } finally {
      setSubmitting(false);
    }
  };

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
                      <Button size="sm" onClick={() => setSelectedOrder(order)}>
                        {order.status === 'KYC_REJECTED' ? 'Resubmit KYC' : 'Complete KYC'}
                      </Button>
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

      {selectedOrder && (
        <Modal isOpen onClose={() => setSelectedOrder(null)} title="Complete rental KYC">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Document type</label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="AADHAR">Aadhar</option>
                <option value="PAN">PAN</option>
                <option value="DL">Driving Licence</option>
                <option value="PASSPORT">Passport</option>
                <option value="VOTER_ID">Voter ID</option>
              </select>
            </div>
            <Input
              label="Document number"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
            />
            <div>
              <p className="mb-2 text-sm font-medium">Front document</p>
              <ImageUploader images={front} onChange={setFront} maxImages={1} uploadFolder="kyc" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Back document (optional)</p>
              <ImageUploader images={back} onChange={setBack} maxImages={1} uploadFolder="kyc" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSelectedOrder(null)}>
                Cancel
              </Button>
              <Button onClick={submitKyc} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit KYC'}
              </Button>
            </div>
          </div>
        </Modal>
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
