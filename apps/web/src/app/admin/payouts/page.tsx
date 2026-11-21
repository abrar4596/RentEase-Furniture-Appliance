'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { Card, CardContent, Button, Input } from '../../../components/ui';
import { useToast } from '../../../components/ui/Toast';
import { IVendorLedgerEntry, formatINR } from '@rentease/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function AdminPayoutsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminPayoutsContent />
    </ProtectedRoute>
  );
}

function AdminPayoutsContent() {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();
  const [entries, setEntries] = useState<IVendorLedgerEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [reference, setReference] = useState('');

  const fetchEntries = useCallback(async () => {
    if (!accessToken) return;
    const res = await fetch(`${API_BASE}/payouts/admin/ledger`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (res.ok && data.success) setEntries(data.data.entries);
  }, [accessToken]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const markPaid = async () => {
    if (!accessToken || selected.length === 0) return;
    const vendorId = entries.find((entry) => entry.id === selected[0])?.vendorId;
    if (!vendorId) return;
    if (reference.trim().length < 3) {
      toastError('Reference required', 'Enter a bank or payout reference');
      return;
    }
    const res = await fetch(`${API_BASE}/payouts/admin/pay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ vendorId, ledgerEntryIds: selected, payoutReference: reference }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      toastError('Payout failed', data.error?.message || 'Could not mark payout paid');
      return;
    }
    success('Payout recorded', `${selected.length} ledger entry(s) marked paid`);
    setSelected([]);
    setReference('');
    fetchEntries();
  };

  const pending = entries.filter((entry) => entry.status === 'PENDING');

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Vendor Payouts</h1>
      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-64 flex-1">
            <Input
              label="Payout reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="UTR / bank reference"
            />
          </div>
          <Button disabled={selected.length === 0} onClick={markPaid}>
            Mark {selected.length || ''} selected paid
          </Button>
        </CardContent>
      </Card>
      {pending.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-gray-500">No pending payouts.</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Select</th>
                    <th className="px-4 py-3">Vendor</th>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Gross Rent</th>
                    <th className="px-4 py-3">Commission</th>
                    <th className="px-4 py-3">Net Payable</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pending.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(entry.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, entry.id]
                                : current.filter((id) => id !== entry.id)
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{entry.vendorId.slice(-8)}</td>
                      <td className="px-4 py-3 font-mono text-xs">{entry.orderId.slice(-8)}</td>
                      <td className="px-4 py-3">{formatINR(entry.grossRentPaise)}</td>
                      <td className="px-4 py-3">
                        {entry.commissionPercent}% ({formatINR(entry.commissionPaise)})
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatINR(entry.netPayablePaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
