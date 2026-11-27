'use client';

/**
 * /kyc/[orderId]  —  Post-checkout KYC submission page.
 *
 * Shown immediately after payment success (the checkout flow redirects here) and
 * also resumable from the Orders page ("Complete KYC" link).
 *
 * Behaviour:
 * - Loads the order; if it is CONFIRMED or beyond, shows a success message.
 * - If PENDING_KYC with no kyc submitted yet → shows the submission form.
 * - If PENDING_KYC with kyc already submitted → shows "pending review" state.
 * - If KYC_REJECTED → shows rejection reason + resubmission form.
 * - Any other status → redirects to /orders.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '../../../context/AuthContext';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { Button, Card, CardContent, Input, Skeleton } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { ImageUploader } from '../../../components/vendor/ImageUploader';
import { IOrder, ProductImage, formatINR } from '@rentease/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

type DocType = 'AADHAR' | 'PAN' | 'DL' | 'PASSPORT' | 'VOTER_ID';

const DOC_TYPE_LABELS: Record<DocType, string> = {
  AADHAR: 'Aadhaar',
  PAN: 'PAN Card',
  DL: 'Driving Licence',
  PASSPORT: 'Passport',
  VOTER_ID: 'Voter ID',
};

const DOC_TYPE_PLACEHOLDER: Record<DocType, string> = {
  AADHAR: '12-digit Aadhaar number',
  PAN: 'e.g. ABCDE1234F',
  DL: 'e.g. MH0220231234567',
  PASSPORT: 'e.g. A1234567',
  VOTER_ID: 'e.g. ABC1234567',
};

export default function KycPage() {
  return (
    <ProtectedRoute allowedRoles={['renter']}>
      <KycContent />
    </ProtectedRoute>
  );
}

function KycContent() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const router = useRouter();
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();

  const [order, setOrder] = useState<IOrder | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [docType, setDocType] = useState<DocType>('AADHAR');
  const [docNumber, setDocNumber] = useState('');
  const [front, setFront] = useState<ProductImage[]>([]);
  const [back, setBack] = useState<ProductImage[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Fetch order
  useEffect(() => {
    if (!accessToken || !orderId) return;
    fetch(`${API_BASE}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((data: { success: boolean; data?: { order: IOrder }; error?: { message: string } }) => {
        if (data.success && data.data?.order) {
          const o = data.data.order;
          // Redirect away for statuses that have nothing to do here.
          if (
            !['PENDING_KYC', 'KYC_REJECTED', 'CONFIRMED'].includes(o.status)
          ) {
            router.replace('/orders');
            return;
          }
          setOrder(o);
        } else {
          toastError('Not found', data.error?.message ?? 'Order not found');
          router.replace('/orders');
        }
      })
      .catch(() => {
        toastError('Error', 'Could not load order');
        router.replace('/orders');
      })
      .finally(() => setLoading(false));
  }, [accessToken, orderId, router, toastError]);

  const submitKyc = async () => {
    if (!order || !accessToken) return;
    if (!front[0]) {
      toastError('Front document required', 'Upload the front side of your ID');
      return;
    }
    if (docNumber.trim().length < 4) {
      toastError('Document number required', 'Enter a valid document number');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/orders/${order.id}/kyc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          documentType: docType,
          documentNumber: docNumber.trim().toUpperCase(),
          frontDocument: { publicId: front[0].publicId, url: front[0].url },
          backDocument: back[0] ? { publicId: back[0].publicId, url: back[0].url } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Submission failed');
      }
      setOrder(data.data.order as IOrder);
      setFront([]);
      setBack([]);
      setDocNumber('');
      success(
        'KYC submitted!',
        'Your documents are with our team. You will hear back within a few hours.'
      );
    } catch (err) {
      toastError('Submission failed', err instanceof Error ? err.message : 'Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!order) return null;

  // ── Confirmed: all done ──────────────────────────────────────────────────────
  if (order.status === 'CONFIRMED') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <div className="mb-4 text-5xl">🎉</div>
        <h1 className="mb-2 text-2xl font-bold">Order confirmed!</h1>
        <p className="mb-6 text-sm text-gray-600">
          Your KYC has been verified. The vendor will schedule your delivery shortly.
        </p>
        <Button onClick={() => router.push('/orders')}>View my orders</Button>
      </div>
    );
  }

  // ── Already submitted, pending review ────────────────────────────────────────
  if (order.status === 'PENDING_KYC' && order.kyc) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <div className="mb-4 text-5xl">⏳</div>
        <h1 className="mb-2 text-2xl font-bold">Documents under review</h1>
        <p className="mb-2 text-sm text-gray-600">
          We received your {DOC_TYPE_LABELS[order.kyc.documentType as DocType] ?? order.kyc.documentType} and
          are reviewing it. This usually takes a few hours.
        </p>
        <p className="mb-6 text-xs text-gray-500">
          Document number on file: {order.kyc.documentNumber}
        </p>
        <Button variant="outline" onClick={() => router.push('/orders')}>
          Back to orders
        </Button>
      </div>
    );
  }

  // ── KYC_REJECTED → show reason + resubmission form ───────────────────────────
  const isResubmission = order.status === 'KYC_REJECTED';

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {isResubmission ? 'Resubmit KYC documents' : 'Complete your KYC'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Order #{order.id.slice(-8)} · {formatINR(order.totalUpfrontPaise)} paid
        </p>
      </div>

      {/* Rejection notice */}
      {isResubmission && order.kyc?.rejectionReason && (
        <Card className="mb-6 border-red-200 bg-red-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-red-700">Previous submission rejected</p>
            <p className="mt-1 text-sm text-red-600">{order.kyc.rejectionReason}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-5 p-6">
          {/* Document type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Document type
            </label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value as DocType)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              {(Object.entries(DOC_TYPE_LABELS) as [DocType, string][]).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Document number */}
          <Input
            label="Document number"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            placeholder={DOC_TYPE_PLACEHOLDER[docType]}
          />

          {/* Front image */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Front side <span className="text-red-500">*</span>
            </p>
            <ImageUploader
              images={front}
              onChange={setFront}
              maxImages={1}
              uploadFolder="kyc"
            />
          </div>

          {/* Back image */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Back side{' '}
              <span className="text-gray-400 text-xs font-normal">(optional for PAN/Passport)</span>
            </p>
            <ImageUploader
              images={back}
              onChange={setBack}
              maxImages={1}
              uploadFolder="kyc"
            />
          </div>

          {/* Privacy note */}
          <p className="text-xs text-gray-500">
            Your documents are stored securely and used only for identity verification. They are
            never shared with third parties outside the rental process.
          </p>

          {/* Submit */}
          <Button
            className="w-full"
            onClick={submitKyc}
            disabled={submitting || !front[0] || docNumber.trim().length < 4}
          >
            {submitting
              ? 'Submitting…'
              : isResubmission
                ? 'Resubmit documents'
                : 'Submit documents'}
          </Button>
        </CardContent>
      </Card>

      {/* Uploaded document previews (if any remain in state) */}
      {(front.length > 0 || back.length > 0) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {front[0] && (
            <div>
              <p className="mb-1 text-xs text-gray-500">Front</p>
              <Image
                src={front[0].url}
                alt="Front document preview"
                width={400}
                height={160}
                className="h-40 w-full rounded-lg border object-contain"
              />
            </div>
          )}
          {back[0] && (
            <div>
              <p className="mb-1 text-xs text-gray-500">Back</p>
              <Image
                src={back[0].url}
                alt="Back document preview"
                width={400}
                height={160}
                className="h-40 w-full rounded-lg border object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
