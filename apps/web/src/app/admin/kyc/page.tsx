'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '../../../context/AuthContext';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { Card, CardContent, Button, Modal, Input } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { IOrder, formatINR } from '@rentease/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function AdminKycPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminKycContent />
    </ProtectedRoute>
  );
}

function AdminKycContent() {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();
  const [orders, setOrders] = useState<IOrder[]>([]);
  const [selected, setSelected] = useState<IOrder | null>(null);
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Signed viewing URLs for the currently-selected order's KYC documents.
  const [frontViewUrl, setFrontViewUrl] = useState<string | null>(null);
  const [backViewUrl, setBackViewUrl] = useState<string | null>(null);
  const [loadingUrls, setLoadingUrls] = useState(false);

  const fetchOrders = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/orders/admin/kyc`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (res.ok && data.success) setOrders(data.data.orders);
  }, [accessToken]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  /** Fetch short-lived signed viewing URLs for a KYC document publicId. */
  const getSignedViewUrl = useCallback(
    async (publicId: string): Promise<string | null> => {
      if (!accessToken) return null;
      try {
        const res = await fetch(
          `${API_BASE}/uploads/kyc-view-url?publicId=${encodeURIComponent(publicId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const data = await res.json();
        if (res.ok && data.success) return data.data.url as string;
      } catch {
        // non-critical — fall back to raw URL
      }
      return null;
    },
    [accessToken]
  );

  /** When an order is selected for review, fetch its signed document URLs. */
  const openReview = useCallback(
    async (order: IOrder) => {
      setSelected(order);
      setReason('');
      setFrontViewUrl(null);
      setBackViewUrl(null);

      if (!order.kyc) return;

      setLoadingUrls(true);
      const [fUrl, bUrl] = await Promise.all([
        order.kyc.frontDocument?.publicId
          ? getSignedViewUrl(order.kyc.frontDocument.publicId)
          : Promise.resolve(order.kyc.frontDocument?.url ?? null),
        order.kyc.backDocument?.publicId
          ? getSignedViewUrl(order.kyc.backDocument.publicId)
          : Promise.resolve(order.kyc.backDocument?.url ?? null),
      ]);
      setFrontViewUrl(fUrl);
      setBackViewUrl(bUrl);
      setLoadingUrls(false);
    },
    [getSignedViewUrl]
  );

  const review = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selected || !accessToken) return;
    if (decision === 'REJECTED' && reason.trim().length < 3) {
      toastError('Reason required', 'Enter a rejection reason');
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/orders/admin/${selected.id}/kyc`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          decision,
          rejectionReason: decision === 'REJECTED' ? reason : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Review failed');
      success(
        'KYC reviewed',
        `Order moved to ${decision === 'APPROVED' ? 'Confirmed' : 'KYC Rejected'}`
      );
      setSelected(null);
      setReason('');
      setFrontViewUrl(null);
      setBackViewUrl(null);
      fetchOrders();
    } catch (error) {
      toastError('Review failed', error instanceof Error ? error.message : 'Could not review KYC');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold">KYC Review Queue</h1>
      <p className="mb-6 text-sm text-gray-600">{orders.length} order(s) awaiting verification</p>
      {orders.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">
            No pending KYC submissions.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-semibold">Order #{order.id.slice(-8)}</p>
                  <p className="text-sm text-gray-600">
                    {order.kyc?.documentType} · {order.kyc?.documentNumber}
                  </p>
                  <p className="text-xs text-gray-500">{formatINR(order.totalUpfrontPaise)}</p>
                  {order.kyc?.submittedAt && (
                    <p className="text-xs text-gray-400">
                      Submitted {new Date(order.kyc.submittedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <Button size="sm" onClick={() => openReview(order)}>
                  Review
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <Modal
          isOpen
          onClose={() => {
            setSelected(null);
            setFrontViewUrl(null);
            setBackViewUrl(null);
          }}
          title={`Review order #${selected.id.slice(-8)}`}
        >
          <div className="space-y-4">
            {/* Document images via signed URLs */}
            {loadingUrls ? (
              <p className="text-sm text-gray-500">Loading document images…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {frontViewUrl && (
                  <a href={frontViewUrl} target="_blank" rel="noreferrer">
                    <Image
                      src={frontViewUrl}
                      alt="Front document"
                      width={600}
                      height={192}
                      className="h-48 w-full rounded-lg border object-contain"
                    />
                    <p className="mt-1 text-center text-xs text-gray-500">Front</p>
                  </a>
                )}
                {backViewUrl && (
                  <a href={backViewUrl} target="_blank" rel="noreferrer">
                    <Image
                      src={backViewUrl}
                      alt="Back document"
                      width={600}
                      height={192}
                      className="h-48 w-full rounded-lg border object-contain"
                    />
                    <p className="mt-1 text-center text-xs text-gray-500">Back</p>
                  </a>
                )}
                {!frontViewUrl && !backViewUrl && (
                  <p className="col-span-2 text-sm text-gray-500">
                    Document images unavailable — view URLs could not be generated.
                  </p>
                )}
              </div>
            )}

            {/* Document metadata */}
            <div className="rounded-lg bg-gray-50 p-3 text-sm">
              <p>
                <span className="font-medium">Document type:</span>{' '}
                {selected.kyc?.documentType ?? '—'}
              </p>
              <p className="mt-1">
                <span className="font-medium">Document number:</span>{' '}
                {selected.kyc?.documentNumber ?? '—'}
              </p>
              {selected.kyc?.submittedAt && (
                <p className="mt-1">
                  <span className="font-medium">Submitted:</span>{' '}
                  {new Date(selected.kyc.submittedAt).toLocaleString()}
                </p>
              )}
            </div>

            <Input
              label="Rejection reason (required to reject)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter a clear reason visible to the renter"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => review('REJECTED')} disabled={processing}>
                Reject
              </Button>
              <Button onClick={() => review('APPROVED')} disabled={processing}>
                {processing ? 'Processing…' : 'Approve'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

