'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ProtectedRoute } from '../../components/auth/ProtectedRoute';
import { Card, CardContent, Button, Input } from '../../components/ui';
import {
  IAdminMetrics,
  IAdminOrderSearchResult,
  IAuditEvent,
  IPlatformSettings,
} from '@rentease/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function AdminConsolePage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminConsole />
    </ProtectedRoute>
  );
}

function AdminConsole() {
  const { accessToken } = useAuth();
  const [metrics, setMetrics] = useState<IAdminMetrics | null>(null);
  const [orders, setOrders] = useState<IAdminOrderSearchResult[]>([]);
  const [audit, setAudit] = useState<IAuditEvent[]>([]);
  const [settings, setSettings] = useState<IPlatformSettings | null>(null);
  const [orderId, setOrderId] = useState('');
  const [status, setStatus] = useState('');
  const [cities, setCities] = useState<
    Array<{ id: string; name: string; state: string; pincodes: string[]; isActive: boolean }>
  >([]);
  const [cityName, setCityName] = useState('');
  const [cityState, setCityState] = useState('');
  const [cityPincodes, setCityPincodes] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [metricsRes, auditRes, settingsRes, citiesRes] = await Promise.all([
      fetch(`${API_BASE}/admin/metrics`, { headers }),
      fetch(`${API_BASE}/admin/audit`, { headers }),
      fetch(`${API_BASE}/admin/settings`, { headers }),
      fetch(`${API_BASE}/admin/cities`, { headers }),
    ]);
    const [metricsData, auditData, settingsData, citiesData] = await Promise.all([
      metricsRes.json(),
      auditRes.json(),
      settingsRes.json(),
      citiesRes.json(),
    ]);
    if (metricsData.success) setMetrics(metricsData.data.metrics);
    if (auditData.success) setAudit(auditData.data.events);
    if (settingsData.success) setSettings(settingsData.data.settings);
    if (citiesData.success)
      setCities(
        citiesData.data.cities.map(
          (city: {
            _id: string;
            name: string;
            state: string;
            pincodes: string[];
            isActive: boolean;
          }) => ({
            id: city._id,
            name: city.name,
            state: city.state,
            pincodes: city.pincodes,
            isActive: city.isActive,
          })
        )
      );
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const searchOrders = async () => {
    if (!accessToken) return;
    const params = new URLSearchParams();
    if (orderId) params.set('orderId', orderId);
    if (status) params.set('status', status);
    const res = await fetch(`${API_BASE}/admin/orders?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (res.ok && data.success) setOrders(data.data.orders);
  };

  const arbitrate = async (id: string, decision: 'APPROVE' | 'DISMISS') => {
    if (!accessToken) return;
    await fetch(`${API_BASE}/admin/orders/${id}/damage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        decision,
        reason:
          decision === 'APPROVE'
            ? 'Damage claim approved after admin review'
            : 'Damage claim dismissed after admin review',
      }),
    });
    searchOrders();
  };

  const saveSettings = async () => {
    if (!accessToken || !settings) return;
    await fetch(`${API_BASE}/admin/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        platformCommissionPercent: settings.platformCommissionPercent,
        kycWindowHours: settings.kycWindowHours,
        reservationTtlMinutes: settings.reservationTtlMinutes,
      }),
    });
    load();
  };

  const createCity = async () => {
    if (!accessToken) return;
    const pincodes = cityPincodes
      .split(',')
      .map((pincode) => pincode.trim())
      .filter(Boolean);
    await fetch(`${API_BASE}/admin/cities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ name: cityName, state: cityState, pincodes, isActive: true }),
    });
    setCityName('');
    setCityState('');
    setCityPincodes('');
    load();
  };

  const toggleCity = async (city: { id: string; isActive: boolean }) => {
    if (!accessToken) return;
    await fetch(`${API_BASE}/admin/cities/${city.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ isActive: !city.isActive }),
    });
    load();
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">Operations Console</h1>
      {metrics && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['Checkout conversion', `${metrics.conversionPercent.toFixed(1)}%`],
            ['48h delivery', `${metrics.deliveryWithin48Percent.toFixed(1)}%`],
            ['Inventory utilization', `${metrics.inventoryUtilizationPercent.toFixed(1)}%`],
            [
              'Maintenance resolution',
              metrics.maintenanceAverageResolutionHours === null
                ? 'N/A'
                : `${metrics.maintenanceAverageResolutionHours.toFixed(1)}h avg`,
            ],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs uppercase text-gray-500">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {settings && (
        <Card className="mb-8">
          <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
            <Input
              label="Commission %"
              type="number"
              value={settings.platformCommissionPercent}
              onChange={(e) =>
                setSettings({ ...settings, platformCommissionPercent: Number(e.target.value) })
              }
            />
            <Input
              label="KYC window hours"
              type="number"
              value={settings.kycWindowHours}
              onChange={(e) => setSettings({ ...settings, kycWindowHours: Number(e.target.value) })}
            />
            <Input
              label="Reservation TTL minutes"
              type="number"
              value={settings.reservationTtlMinutes}
              onChange={(e) =>
                setSettings({ ...settings, reservationTtlMinutes: Number(e.target.value) })
              }
            />
            <Button onClick={saveSettings}>Save platform settings</Button>
          </CardContent>
        </Card>
      )}

      <Card className="mb-8">
        <CardContent className="p-5">
          <div className="mb-4 flex flex-wrap gap-3">
            <Input label="Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
            <Input label="Status" value={status} onChange={(e) => setStatus(e.target.value)} />
            <Button className="self-end" onClick={searchOrders}>
              Search orders
            </Button>
          </div>
          <div className="space-y-2">
            {orders.map((order) => (
              <div
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border p-3 text-sm"
              >
                <div>
                  <strong>#{order.id.slice(-8)}</strong> · {order.status} · renter{' '}
                  {order.renterId.slice(-8)}
                </div>
                {order.damageClaim && (
                  <div className="flex gap-2">
                    <span className="text-xs text-gray-600">
                      Claim: ₹{(order.damageClaim.deductedPaise / 100).toFixed(2)}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => arbitrate(order.id, 'DISMISS')}
                    >
                      Dismiss
                    </Button>
                    <Button size="sm" onClick={() => arbitrate(order.id, 'APPROVE')}>
                      Approve
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardContent className="p-5">
          <h2 className="mb-4 font-semibold">City and service zones</h2>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <Input label="City" value={cityName} onChange={(e) => setCityName(e.target.value)} />
            <Input label="State" value={cityState} onChange={(e) => setCityState(e.target.value)} />
            <Input
              label="Pincodes (comma separated)"
              value={cityPincodes}
              onChange={(e) => setCityPincodes(e.target.value)}
            />
            <Button className="self-end" onClick={createCity}>
              Add city
            </Button>
          </div>
          <div className="space-y-2">
            {cities.map((city) => (
              <div
                key={city.id}
                className="flex items-center justify-between rounded border p-3 text-sm"
              >
                <div>
                  <strong>{city.name}</strong>, {city.state} · {city.pincodes.length} pincodes
                </div>
                <Button size="sm" variant="outline" onClick={() => toggleCity(city)}>
                  {city.isActive ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-3 font-semibold">Recent admin audit</h2>
          <div className="space-y-2 text-xs">
            {audit.map((event) => (
              <div key={event.id} className="border-b pb-2">
                <strong>{event.action}</strong> · {event.entityType}/{event.entityId.slice(-8)} ·{' '}
                {new Date(event.createdAt).toLocaleString()}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
