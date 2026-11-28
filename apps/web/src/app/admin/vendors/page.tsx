'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../context/AuthContext';
import { ProtectedRoute } from '../../../components/auth/ProtectedRoute';
import { Button } from '../../../components/ui/Button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { useToast } from '../../../components/ui/Toast';
import { IVendorProfile, VENDOR_STATUSES, VendorStatus } from '@rentease/shared';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  Phone,
  Store,
  RefreshCw,
  Search,
  AlertTriangle,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

export default function AdminVendorsPage() {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      <AdminVendorsContent />
    </ProtectedRoute>
  );
}

function AdminVendorsContent() {
  const { accessToken } = useAuth();
  const { success, error: toastError } = useToast();

  const [vendors, setVendors] = useState<IVendorProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Rejection Modal State
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<IVendorProfile | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchVendors = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vendors/admin/all`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.success && data.data?.vendors) {
        setVendors(data.data.vendors);
      } else {
        toastError('Error', data.error?.message || 'Failed to load vendors');
      }
    } catch {
      toastError('Network Error', 'Could not reach admin vendor service');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, toastError]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Handle Verification Action
  const handleVerify = async (vendor: IVendorProfile, status: VendorStatus, reason?: string) => {
    if (!accessToken) return;
    setIsProcessing(true);

    try {
      const res = await fetch(`${API_BASE}/vendors/admin/${vendor.id}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status,
          rejectionReason: reason || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        success(
          'Verification Updated',
          `${vendor.businessName} has been ${status === VENDOR_STATUSES.APPROVED ? 'Approved' : 'Rejected'}`
        );
        setIsRejectModalOpen(false);
        setSelectedVendor(null);
        setRejectionReason('');
        fetchVendors();
      } else {
        toastError('Verification Failed', data.error?.message || 'Action failed');
      }
    } catch {
      toastError('Error', 'Network error updating verification');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredVendors = vendors.filter((v) => {
    const matchesFilter = statusFilter === 'ALL' ? true : v.verificationStatus === statusFilter;
    const matchesSearch =
      v.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.contactPhone.includes(searchQuery);
    return matchesFilter && matchesSearch;
  });

  const pendingCount = vendors.filter(
    (v) => v.verificationStatus === VENDOR_STATUSES.PENDING
  ).length;
  const approvedCount = vendors.filter(
    (v) => v.verificationStatus === VENDOR_STATUSES.APPROVED
  ).length;
  const rejectedCount = vendors.filter(
    (v) => v.verificationStatus === VENDOR_STATUSES.REJECTED
  ).length;
  const suspendedCount = vendors.filter(
    (v) => v.verificationStatus === VENDOR_STATUSES.SUSPENDED
  ).length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Title & Subtitle */}
      <div>
        <div className="flex items-center gap-2 text-brand-600 font-semibold text-xs tracking-wider uppercase">
          <Shield className="h-4 w-4" />
          <span>Operations Admin Portal</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 mt-1">
          Vendor Verification Queue
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Review, approve, or reject local vendor store partners before their rental inventory is
          published.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 border-amber-200 bg-amber-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
              Pending Review
            </span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-900 mt-2">{pendingCount}</p>
        </Card>

        <Card className="p-4 border-emerald-200 bg-emerald-50/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
              Approved Partners
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-900 mt-2">{approvedCount}</p>
        </Card>

        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
              Rejected
            </span>
            <XCircle className="h-4 w-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold text-rose-700 mt-2">{rejectedCount}</p>
        </Card>
        <Card className="p-4 border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-700">
              Suspended
            </span>
            <AlertTriangle className="h-4 w-4 text-gray-600" />
          </div>
          <p className="text-2xl font-bold text-gray-800 mt-2">{suspendedCount}</p>
        </Card>
      </div>

      {/* Vendors Table Card */}
      <Card className="border-gray-200 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg font-bold text-gray-900">
                Registered Store Partners
              </CardTitle>
              <CardDescription className="text-xs text-gray-500">
                Detailed listing of vendor accounts, operational city hubs, and delivery pincodes.
              </CardDescription>
            </div>

            {/* Filter Tabs & Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search store or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 w-48 sm:w-60"
                />
              </div>

              <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-xs font-medium">
                {[
                  'ALL',
                  VENDOR_STATUSES.PENDING,
                  VENDOR_STATUSES.APPROVED,
                  VENDOR_STATUSES.REJECTED,
                  VENDOR_STATUSES.SUSPENDED,
                ].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                      statusFilter === st
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
          {isLoading ? (
            <div className="p-12 text-center text-sm text-gray-500 flex flex-col items-center justify-center gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-brand-600" />
              <span>Loading verification queue...</span>
            </div>
          ) : filteredVendors.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              <Store className="h-10 w-10 text-gray-300 mx-auto mb-2" />
              <p className="font-semibold text-gray-700">No vendors found</p>
              <p className="text-xs text-gray-500 mt-1">
                Try adjusting your search query or status filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Store Partner</th>
                    <th className="px-4 py-3">City & Pincodes</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Verification Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredVendors.map((vendor) => (
                    <tr key={vendor.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-xs shrink-0">
                            <Store className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 leading-snug">
                              {vendor.businessName}
                            </p>
                            <p className="text-[11px] text-gray-500">
                              Registered: {new Date(vendor.createdAt).toLocaleDateString('en-IN')}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-1 font-medium text-gray-900 text-xs">
                            <MapPin className="h-3 w-3 text-brand-600" />
                            {vendor.cityName || 'Pilot City'}
                          </span>
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {vendor.servicePincodes.slice(0, 4).map((pin) => (
                              <span
                                key={pin}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700"
                              >
                                {pin}
                              </span>
                            ))}
                            {vendor.servicePincodes.length > 4 && (
                              <span className="text-[10px] text-gray-500 font-medium">
                                +{vendor.servicePincodes.length - 4} more
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-xs font-medium text-gray-700">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-gray-400" />
                          {vendor.contactPhone}
                        </span>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold capitalize w-fit ${
                              vendor.verificationStatus === VENDOR_STATUSES.APPROVED
                                ? 'bg-emerald-100 text-emerald-800'
                                : vendor.verificationStatus === VENDOR_STATUSES.PENDING
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {vendor.verificationStatus}
                          </span>
                          {vendor.verificationStatus === VENDOR_STATUSES.REJECTED &&
                            vendor.rejectionReason && (
                              <span className="text-[11px] text-rose-600 italic">
                                &ldquo;{vendor.rejectionReason}&rdquo;
                              </span>
                            )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {vendor.verificationStatus !== VENDOR_STATUSES.APPROVED && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleVerify(vendor, VENDOR_STATUSES.APPROVED)}
                              isLoading={isProcessing}
                              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                              Approve
                            </Button>
                          )}

                          {vendor.verificationStatus !== VENDOR_STATUSES.REJECTED && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedVendor(vendor);
                                setIsRejectModalOpen(true);
                              }}
                              className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                            >
                              <XCircle className="h-3.5 w-3.5 mr-1" />
                              Reject
                            </Button>
                          )}
                          {vendor.verificationStatus !== VENDOR_STATUSES.SUSPENDED && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleVerify(
                                  vendor,
                                  VENDOR_STATUSES.SUSPENDED,
                                  'Suspended by platform administration'
                                )
                              }
                              isLoading={isProcessing}
                              className="text-xs text-gray-700 border-gray-300 hover:bg-gray-100"
                            >
                              <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                              Suspend
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reject Reason Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => {
          setIsRejectModalOpen(false);
          setSelectedVendor(null);
          setRejectionReason('');
        }}
        title="Reject Vendor Verification"
      >
        <div className="space-y-4 pt-2">
          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <span>
              Rejecting <strong>{selectedVendor?.businessName}</strong> will restrict them from
              publishing active listings. Please state the reason for compliance records.
            </span>
          </div>

          <Input
            label="Rejection Reason"
            placeholder="e.g. Invalid business documentation or outside service territory"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            required
          />

          <div className="flex items-center justify-end gap-2.5 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsRejectModalOpen(false);
                setSelectedVendor(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={!rejectionReason.trim()}
              isLoading={isProcessing}
              onClick={() => {
                if (selectedVendor) {
                  handleVerify(selectedVendor, VENDOR_STATUSES.REJECTED, rejectionReason);
                }
              }}
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
