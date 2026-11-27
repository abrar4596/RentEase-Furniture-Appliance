'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useAuth } from '../../../context/AuthContext';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { ProductModal } from '../../../components/vendor/ProductModal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/Toast';
import {
  IVendorProfile,
  IProduct,
  ICity,
  IOrder,
  PRODUCT_STATUSES,
  VENDOR_STATUSES,
  ProductStatus,
  formatINR,
  IVendorLedgerEntry,
} from '@rentease/shared';
import {
  Store,
  Plus,
  Package,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Edit2,
  PauseCircle,
  PlayCircle,
  Trash2,
  Building,
  MapPin,
  TrendingUp,
  RefreshCw,
  Search,
  Truck,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function VendorDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['vendor']}>
      <VendorDashboardContent />
    </ProtectedRoute>
  );
}

function VendorDashboardContent() {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();

  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [vendorProfile, setVendorProfile] = useState<IVendorProfile | null>(null);
  const [cities, setCities] = useState<ICity[]>([]);

  // Onboarding Form State
  const [onboardingBusinessName, setOnboardingBusinessName] = useState('');
  const [onboardingPhone, setOnboardingPhone] = useState('');
  const [onboardingCityId, setOnboardingCityId] = useState('');
  const [onboardingPincodes, setOnboardingPincodes] = useState('');
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);

  // Products State
  const [products, setProducts] = useState<IProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<IProduct | null>(null);

  // Quick Stock Edit State
  const [updatingStockId, setUpdatingStockId] = useState<string | null>(null);
  const [fulfillmentOrders, setFulfillmentOrders] = useState<IOrder[]>([]);
  const [isLoadingFulfillment, setIsLoadingFulfillment] = useState(false);
  const [ledgerEntries, setLedgerEntries] = useState<IVendorLedgerEntry[]>([]);
  const [pendingPayoutPaise, setPendingPayoutPaise] = useState(0);
  const [slaNow, setSlaNow] = useState(0);

  useEffect(() => {
    setSlaNow(Date.now());
  }, []);

  const getDeliverySla = (order: IOrder): { label: string; breached: boolean } => {
    if (!order.kycApprovedAt) return { label: 'Awaiting KYC approval', breached: false };
    const start = new Date(order.kycApprovedAt).getTime();
    const end = order.deliveredAt
      ? new Date(order.deliveredAt).getTime()
      : slaNow || start;
    const elapsedHours = Math.max(0, Math.floor((end - start) / (60 * 60 * 1000)));
    if (elapsedHours <= 48) {
      return { label: `${elapsedHours}h / 48h`, breached: false };
    }
    return { label: `${elapsedHours}h / breached`, breached: true };
  };

  // Fetch Cities
  const fetchCities = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/cities`);
      const data = await res.json();
      if (data.success && data.data?.cities) {
        setCities(data.data.cities);
        if (data.data.cities.length > 0 && !onboardingCityId) {
          setOnboardingCityId(data.data.cities[0].id);
        }
      }
    } catch {
      // Fallback or silent catch
    }
  }, [onboardingCityId]);

  // Fetch Vendor Profile
  const fetchVendorProfile = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/vendors/me`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.status === 404) {
        setVendorProfile(null);
      } else if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVendorProfile(data.data?.profile ?? null);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch vendor profile';
      toastError('Network Error', message);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [accessToken, toastError]);

  // Fetch Products
  const fetchProducts = useCallback(async () => {
    if (!accessToken || !vendorProfile) return;
    setIsLoadingProducts(true);
    try {
      const res = await fetch(`${API_BASE}/products/vendor/mine`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const data = await res.json();
      if (data.success && data.data?.products) {
        setProducts(data.data.products);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load products';
      toastError('Error', message);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [accessToken, vendorProfile, toastError]);

  const fetchFulfillmentOrders = useCallback(async () => {
    if (!accessToken || !vendorProfile) return;
    setIsLoadingFulfillment(true);
    try {
      const res = await fetch(`${API_BASE}/orders/vendor/mine`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) setFulfillmentOrders(data.data.orders);
    } catch {
      toastError('Error', 'Failed to load fulfillment orders');
    } finally {
      setIsLoadingFulfillment(false);
    }
  }, [accessToken, vendorProfile, toastError]);

  const fetchLedger = useCallback(async () => {
    if (!accessToken || !vendorProfile) return;
    try {
      const res = await fetch(`${API_BASE}/payouts/ledger`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLedgerEntries(data.data.entries);
        setPendingPayoutPaise(data.data.pendingPaise);
      }
    } catch {
      toastError('Error', 'Failed to load payout ledger');
    }
  }, [accessToken, vendorProfile, toastError]);

  const updateFulfillmentStatus = async (
    orderId: string,
    status: 'OUT_FOR_DELIVERY' | 'ACTIVE'
  ) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/orders/vendor/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error?.message || 'Failed to update order');
      success('Fulfillment updated', `Order moved to ${status.replaceAll('_', ' ')}`);
      fetchFulfillmentOrders();
    } catch (error) {
      toastError(
        'Update failed',
        error instanceof Error ? error.message : 'Could not update order'
      );
    }
  };

  const completeReturn = async (orderId: string) => {
    if (!accessToken) return;
    try {
      const res = await fetch(`${API_BASE}/orders/vendor/${orderId}/return`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          damageDescription: undefined,
          damagePhotos: [],
          damageDeductionPaise: 0,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error?.message || 'Failed to complete return');
      success('Return completed', 'Inventory has been restored');
      fetchFulfillmentOrders();
    } catch (error) {
      toastError(
        'Return failed',
        error instanceof Error ? error.message : 'Could not complete return'
      );
    }
  };

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);

  useEffect(() => {
    fetchVendorProfile();
  }, [fetchVendorProfile]);

  useEffect(() => {
    if (vendorProfile) {
      fetchProducts();
      fetchFulfillmentOrders();
      fetchLedger();
    }
  }, [vendorProfile, fetchProducts, fetchFulfillmentOrders, fetchLedger]);

  // Handle Onboarding Submission
  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken) return;

    const pincodesList = onboardingPincodes
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    if (pincodesList.length === 0) {
      toastError('Validation Error', 'Please enter at least one valid 6-digit pincode');
      return;
    }

    setIsSubmittingProfile(true);
    try {
      const res = await fetch(`${API_BASE}/vendors/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          businessName: onboardingBusinessName,
          contactPhone: onboardingPhone,
          cityId: onboardingCityId,
          servicePincodes: pincodesList,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        success(
          'Store Registered',
          'Vendor profile created successfully. Awaiting admin verification.'
        );
        setVendorProfile(data.data.profile);
      } else {
        toastError('Failed to Create Profile', data.error?.message || 'Please check your input.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Submission failed';
      toastError('Network Error', message);
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  // Quick Status Toggle (Pause / Resume)
  const handleToggleStatus = async (product: IProduct) => {
    if (!accessToken) return;
    const newStatus: ProductStatus =
      product.status === PRODUCT_STATUSES.ACTIVE
        ? PRODUCT_STATUSES.PAUSED
        : PRODUCT_STATUSES.ACTIVE;

    try {
      const res = await fetch(`${API_BASE}/products/${product.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        success('Status Updated', `Product marked as ${newStatus}`);
        fetchProducts();
      } else {
        toastError('Action Failed', data.error?.message || 'Could not update status');
      }
    } catch {
      toastError('Error', 'Failed to toggle status');
    }
  };

  // Quick Stock Increment / Decrement
  const handleUpdateStock = async (product: IProduct, delta: number) => {
    if (!accessToken) return;
    const newStock = Math.max(0, product.stockCount + delta);
    setUpdatingStockId(product.id);

    try {
      const res = await fetch(`${API_BASE}/products/${product.id}/stock`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ stockCount: newStock }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        fetchProducts();
      } else {
        toastError('Error', data.error?.message || 'Failed to update stock');
      }
    } catch {
      toastError('Error', 'Failed to update stock');
    } finally {
      setUpdatingStockId(null);
    }
  };

  // Delete Product
  const handleDeleteProduct = async (id: string) => {
    if (!accessToken) return;
    if (
      !window.confirm('Are you sure you want to delete this listing? This action cannot be undone.')
    ) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/products/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        success('Deleted', 'Product removed successfully');
        fetchProducts();
      } else {
        toastError('Error', data.error?.message || 'Could not delete product');
      }
    } catch {
      toastError('Error', 'Network error deleting product');
    }
  };

  // Filter products by search and status
  const filteredProducts = products.filter((p) => {
    const matchesFilter = filterStatus === 'ALL' ? true : p.status === filterStatus;
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.subcategory.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Calculate Metrics
  const totalProducts = products.length;
  const activeListings = products.filter((p) => p.status === PRODUCT_STATUSES.ACTIVE).length;
  const pausedListings = products.filter((p) => p.status === PRODUCT_STATUSES.PAUSED).length;
  const totalStockUnits = products.reduce((acc, curr) => acc + curr.stockCount, 0);

  const isApprovedVendor = vendorProfile?.verificationStatus === VENDOR_STATUSES.APPROVED;

  if (isLoadingProfile) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col items-center justify-center space-y-4 min-h-[300px]">
          <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm font-medium text-gray-500">Loading vendor portal...</p>
        </div>
      </div>
    );
  }

  // View 1: If Vendor Profile is not created yet
  if (!vendorProfile) {
    return (
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-12">
        <Card className="border-gray-200 shadow-md">
          <CardHeader className="text-center pb-6 border-b border-gray-100">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Store className="h-7 w-7" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Complete Your Vendor Profile
            </CardTitle>
            <CardDescription className="text-sm text-gray-600 max-w-md mx-auto mt-2">
              Join RentEase as an authorized local dealer. Furnish homes and supply appliances to
              verified renters in Tier-2/3 Indian cities.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleCreateProfile} className="space-y-5">
              <Input
                label="Store / Business Name"
                placeholder="e.g. Royal Furnishings & Appliances"
                value={onboardingBusinessName}
                onChange={(e) => setOnboardingBusinessName(e.target.value)}
                required
              />

              <Input
                label="Contact Phone Number"
                placeholder="e.g. 9876543210"
                value={onboardingPhone}
                onChange={(e) => setOnboardingPhone(e.target.value)}
                pattern="^[6-9]\d{9}$"
                helperText="10-digit Indian mobile number for order delivery coordination"
                required
              />

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-700 mb-1.5">
                  Operating City
                </label>
                <select
                  value={onboardingCityId}
                  onChange={(e) => setOnboardingCityId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  required
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}, {c.state}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">Select your primary pilot city hub.</p>
              </div>

              <Input
                label="Serviced Pincodes (Comma separated)"
                placeholder="e.g. 302001, 302015, 302020"
                value={onboardingPincodes}
                onChange={(e) => setOnboardingPincodes(e.target.value)}
                helperText="Enter 6-digit pincodes within your city where you provide 24-48h delivery & setup."
                required
              />

              <div className="pt-3">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full justify-center text-sm py-2.5 font-semibold"
                  isLoading={isSubmittingProfile}
                >
                  Submit Store Registration
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // View 2: Vendor Dashboard with Profile & Inventory
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Verification Status Banner */}
      {vendorProfile.verificationStatus === VENDOR_STATUSES.PENDING && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
          <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <h4 className="font-semibold text-amber-900">Store Verification Under Review</h4>
            <p className="text-amber-800 mt-1">
              Your store profile for <strong>{vendorProfile.businessName}</strong> is pending admin
              verification. You can start adding products now in <strong>draft mode</strong>. Once
              verified by our operations team, you can publish items live to renters.
            </p>
          </div>
        </div>
      )}

      {vendorProfile.verificationStatus === VENDOR_STATUSES.APPROVED && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <h4 className="font-semibold text-emerald-900">Verified Partner Store</h4>
            <p className="text-emerald-800 mt-1">
              Your store is active in <strong>{vendorProfile.cityName || 'Pilot City'}</strong>. All
              active inventory is visible to local renters with guaranteed 24-48h fulfillment.
            </p>
          </div>
        </div>
      )}

      {vendorProfile.verificationStatus === VENDOR_STATUSES.REJECTED && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 sm:p-5 flex items-start gap-3.5 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
          <div className="text-sm">
            <h4 className="font-semibold text-rose-900">Store Verification Not Approved</h4>
            <p className="text-rose-800 mt-1">
              {vendorProfile.rejectionReason
                ? `Reason: ${vendorProfile.rejectionReason}`
                : 'Please contact vendor operations to resolve store details.'}
            </p>
          </div>
        </div>
      )}

      {/* Header & Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
            {vendorProfile.businessName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1 font-medium text-gray-700">
              <MapPin className="h-3.5 w-3.5 text-brand-600" />
              {vendorProfile.cityName || 'Local City'} ({vendorProfile.servicePincodes.length}{' '}
              pincodes)
            </span>
            <span>•</span>
            <span>Phone: {vendorProfile.contactPhone}</span>
          </div>
        </div>

        <Button
          variant="primary"
          onClick={() => {
            setEditingProduct(null);
            setIsProductModalOpen(true);
          }}
          className="flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Add New Product</span>
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Products
            </span>
            <Package className="h-4 w-4 text-brand-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{totalProducts}</p>
        </Card>

        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Active Listings
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{activeListings}</p>
        </Card>

        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Paused Listings
            </span>
            <PauseCircle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{pausedListings}</p>
        </Card>

        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Total Stock Units
            </span>
            <Building className="h-4 w-4 text-gray-600" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{totalStockUnits}</p>
        </Card>

        <Card className="p-4 border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Pending Payout
            </span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">
            {formatINR(pendingPayoutPaise)}
          </p>
          <p className="mt-1 text-xs text-gray-500">{ledgerEntries.length} ledger entry(s)</p>
        </Card>
      </div>

      {/* Fulfillment Queue */}
      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-4 sm:p-5">
          <div>
            <CardTitle className="text-lg font-bold text-gray-900">Fulfillment Queue</CardTitle>
            <CardDescription className="text-xs text-gray-500">
              Manage confirmed orders through delivery and activation.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingFulfillment ? (
            <div className="p-8 text-center text-sm text-gray-500">
              Loading fulfillment orders...
            </div>
          ) : fulfillmentOrders.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              <Truck className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              No confirmed or active rental orders.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Delivery</th>
                    <th className="px-4 py-3">48h SLA</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fulfillmentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50/70">
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-gray-900">#{order.id.slice(-8)}</p>
                        <p className="text-xs text-gray-500">{order.items.length} item(s)</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-900">
                          {order.deliveryAddress.fullName}
                        </p>
                        <p className="text-xs text-gray-500">{order.deliveryAddress.phone}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-xs text-gray-700">{order.preferredDeliveryDate}</p>
                        <p className="text-xs capitalize text-gray-500">
                          {order.preferredDeliverySlot}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        {(() => {
                          const sla = getDeliverySla(order);
                          return (
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                sla.breached
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {sla.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                          {order.status.replaceAll('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {order.status === 'CONFIRMED' && (
                          <Button
                            size="sm"
                            onClick={() => updateFulfillmentStatus(order.id, 'OUT_FOR_DELIVERY')}
                          >
                            Mark Out for Delivery
                          </Button>
                        )}
                        {order.status === 'OUT_FOR_DELIVERY' && (
                          <Button
                            size="sm"
                            onClick={() => updateFulfillmentStatus(order.id, 'ACTIVE')}
                          >
                            Mark Delivered
                          </Button>
                        )}
                        {order.status === 'RETURN_REQUESTED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => completeReturn(order.id)}
                          >
                            Complete Return
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Catalog Table Section */}
      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-gray-900">Inventory Catalog</CardTitle>
              <CardDescription className="text-xs text-gray-500">
                Manage your furniture and appliance listings, rental tenures, and stock levels.
              </CardDescription>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search listings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-44 sm:w-56"
                />
              </div>

              <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium">
                {[
                  'ALL',
                  PRODUCT_STATUSES.ACTIVE,
                  PRODUCT_STATUSES.DRAFT,
                  PRODUCT_STATUSES.PAUSED,
                ].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setFilterStatus(st)}
                    className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                      filterStatus === st
                        ? 'bg-brand-600 text-white font-semibold'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {st.toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoadingProducts ? (
            <div className="p-12 text-center text-sm text-gray-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-600" />
              <span>Updating catalog...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <Package className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="font-semibold text-gray-700">No products found</p>
              <p className="text-xs text-gray-500 mt-1">
                {searchQuery || filterStatus !== 'ALL'
                  ? 'Try adjusting your search query or filter tab.'
                  : 'Start listing your local inventory by clicking "Add New Product" above.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Monthly Rent</th>
                    <th className="px-4 py-3">Deposit</th>
                    <th className="px-4 py-3">Stock Units</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.map((p) => {
                    const minRentPaise = Math.min(...p.tenureTiers.map((t) => t.monthlyRentPaise));
                    const thumbnail = p.images[0]?.url;

                    return (
                      <tr key={p.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 rounded-lg border border-gray-200 bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                              {thumbnail ? (
                                <Image
                                  src={thumbnail}
                                  alt={p.title}
                                  fill
                                  sizes="48px"
                                  className="object-cover"
                                />
                              ) : (
                                <Package className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900 leading-snug line-clamp-1">
                                {p.title}
                              </p>
                              <p className="text-xs text-gray-500 capitalize">
                                Condition: {p.condition.replace('_', ' ')}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 capitalize">
                            {p.subcategory}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 font-medium text-gray-900">
                          <span className="text-xs text-gray-500 font-normal">from </span>
                          {formatINR(minRentPaise)}
                          <span className="text-xs text-gray-500 font-normal">/mo</span>
                        </td>

                        <td className="px-4 py-3.5">
                          {p.securityDepositPaise === 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                              ₹0 Deposit
                            </span>
                          ) : (
                            <span className="text-xs text-gray-700 font-medium">
                              {formatINR(p.securityDepositPaise)}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={updatingStockId === p.id || p.stockCount <= 0}
                              onClick={() => handleUpdateStock(p, -1)}
                              className="h-6 w-6 rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-semibold text-gray-900 text-xs">
                              {p.stockCount}
                            </span>
                            <button
                              type="button"
                              disabled={updatingStockId === p.id}
                              onClick={() => handleUpdateStock(p, 1)}
                              className="h-6 w-6 rounded border border-gray-300 text-xs font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              p.status === PRODUCT_STATUSES.ACTIVE
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.status === PRODUCT_STATUSES.PAUSED
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Status toggle action */}
                            {p.status === PRODUCT_STATUSES.ACTIVE && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStatus(p)}
                                title="Pause Listing"
                                className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                              >
                                <PauseCircle className="h-4 w-4" />
                              </Button>
                            )}

                            {p.status === PRODUCT_STATUSES.PAUSED && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleToggleStatus(p)}
                                title="Activate Listing"
                                className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                <PlayCircle className="h-4 w-4" />
                              </Button>
                            )}

                            {/* Edit Action */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingProduct(p);
                                setIsProductModalOpen(true);
                              }}
                              title="Edit Listing"
                              className="h-8 w-8 p-0 text-gray-600 hover:text-gray-900"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>

                            {/* Delete Action */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteProduct(p.id)}
                              title="Delete Listing"
                              className="h-8 w-8 p-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Create / Edit Modal */}
      {accessToken && vendorProfile && (
        <ProductModal
          isOpen={isProductModalOpen}
          onClose={() => {
            setIsProductModalOpen(false);
            setEditingProduct(null);
          }}
          onSaved={() => {
            fetchProducts();
          }}
          product={editingProduct}
          vendorCityId={vendorProfile.cityId}
          isApprovedVendor={isApprovedVendor}
          accessToken={accessToken}
        />
      )}
    </div>
  );
}
