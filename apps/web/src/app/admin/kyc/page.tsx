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
                </div>
                <Button size="sm" onClick={() => setSelected(order)}>
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
          onClose={() => setSelected(null)}
          title={`Review order #${selected.id.slice(-8)}`}
        >
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {selected.kyc?.frontDocument?.url && (
                <a href={selected.kyc.frontDocument.url} target="_blank" rel="noreferrer">
                  <Image
                    src={selected.kyc.frontDocument.url}
                    alt="Front document"
                    width={600}
                    height={192}
                    className="h-48 w-full rounded-lg object-contain border"
                  />
                </a>
              )}
              {selected.kyc?.backDocument?.url && (
                <a href={selected.kyc.backDocument.url} target="_blank" rel="noreferrer">
                  <Image
                    src={selected.kyc.backDocument.url}
                    alt="Back document"
                    width={600}
                    height={192}
                    className="h-48 w-full rounded-lg object-contain border"
                  />
                </a>
              )}
            </div>
            <p className="text-sm">
              <strong>Document:</strong> {selected.kyc?.documentType} ·{' '}
              {selected.kyc?.documentNumber}
            </p>
            <Input
              label="Rejection reason (required to reject)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter a clear reason"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => review('REJECTED')} disabled={processing}>
                Reject
              </Button>
              <Button onClick={() => review('APPROVED')} disabled={processing}>
                {processing ? 'Processing...' : 'Approve'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
