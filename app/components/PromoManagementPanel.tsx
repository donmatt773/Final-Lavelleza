'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import PromoForm from '@/app/components/PromoForm';
import PromoDetailsView from '@/app/components/PromoDetailsView';

type PromoImage = {
  fileUrl?: string;
  altText?: string;
};

type PromoInclusion = {
  _id?: string;
  type?: string;
  name?: string;
  description?: string;
  quantity?: number;
  roomId?: {
    _id?: string;
    name?: string;
    code?: string;
  } | string;
};

type AdditionalRoomDiscount = {
  mode?: 'PERCENT' | 'FIXED_AMOUNT';
  value?: number;
};

type PromoRecord = {
  _id: string;
  name: string;
  code: string;
  packagePrice: number;
  startDate?: string;
  endDate?: string;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  description?: string;
  notes?: string;
  termsAndConditions?: string[];
  banner?: PromoImage;
  inclusions?: PromoInclusion[];
  additionalRoomDiscount?: AdditionalRoomDiscount | null;
  includedRoomIds?: Array<{
    _id?: string;
    name?: string;
    code?: string;
  }>;
  isArchived?: boolean;
  createdAt?: string;
};

type Props = {
  active: boolean;
};

const PAGE_SIZE = 6;

const formatPrice = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatValidity = (startDate?: string, endDate?: string) => {
  if (!startDate && !endDate) return 'No schedule';
  const dateFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' });

  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;

  const safeStart = start && !Number.isNaN(start.getTime()) ? dateFormat.format(start) : 'N/A';
  const safeEnd = end && !Number.isNaN(end.getTime()) ? dateFormat.format(end) : 'N/A';

  return `${safeStart} - ${safeEnd}`;
};

const isCurrentlyValid = (promo: PromoRecord) => {
  if (promo.status !== 'ACTIVE') return false;
  if (!promo.startDate || !promo.endDate) return false;
  const now = new Date();
  const start = new Date(promo.startDate);
  const end = new Date(promo.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  return now >= start && now <= end;
};

export default function PromoManagementPanel({ active }: Props) {
  const [promos, setPromos] = useState<PromoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [validityFilter, setValidityFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('success');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [failedBannerUrls, setFailedBannerUrls] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [selectedPromo, setSelectedPromo] = useState<PromoRecord | null>(null);
  const [detailsPromo, setDetailsPromo] = useState<PromoRecord | null>(null);

  const getAuthHeaders = () => ({
    // session cookie is used for authorization on the server
  });

  const getJsonHeaders = () => ({
    'Content-Type': 'application/json',
  });

  const loadPromos = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (validityFilter !== 'ALL') params.set('validity', validityFilter);

      const query = params.toString();
      const res = await fetch(`/api/promos${query ? `?${query}` : ''}`, { headers: getAuthHeaders(), credentials: 'same-origin' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Unable to load promos');
      }

      setPromos(Array.isArray(data) ? data : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load promos');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, validityFilter]);

  useEffect(() => {
    if (!active) return;

    const timeoutId = window.setTimeout(() => {
      void loadPromos();
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [active, loadPromos]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      void loadPromos();
      setPage(1);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [active, loadPromos, search, statusFilter, validityFilter]);

  const filteredPromos = useMemo(() => {
    if (statusFilter === 'ALL') return promos;
    return promos.filter((promo) => promo.status === statusFilter);
  }, [promos, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredPromos.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page <= totalPages) return;

    const timeoutId = window.setTimeout(() => {
      setPage(1);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [page, totalPages]);

  const pagedPromos = filteredPromos.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleStatusToggle = async (promo: PromoRecord) => {
    const nextStatus = promo.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    setProcessingId(promo._id);
    setMessage(null);

    try {
      const res = await fetch(`/api/promos/${promo._id}`, {
        method: 'PATCH',
        headers: { ...getJsonHeaders(), ...getAuthHeaders() },
        body: JSON.stringify({ status: nextStatus }),
        credentials: 'same-origin',
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Unable to update promo status');
      }

      setPromos((current) => current.map((item) => (item._id === promo._id ? { ...item, status: nextStatus } : item)));
      setDetailsPromo((current) => (current && current._id === promo._id ? { ...current, status: nextStatus } : current));
      setMessage(`Promo ${nextStatus === 'ACTIVE' ? 'activated' : 'deactivated'} successfully.`);
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update promo status');
      setMessageType('error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleArchive = async (promoId: string) => {
    setProcessingId(promoId);
    setMessage(null);
    try {
      const res = await fetch(`/api/promos/${promoId}`, {
        method: 'PATCH',
        headers: { ...getJsonHeaders(), ...getAuthHeaders() },
        body: JSON.stringify({ isArchived: true }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Unable to archive promo');
      }
      setPromos((current) => current.filter((promo) => promo._id !== promoId));
      setMessage('Promo archived successfully.');
      setMessageType('success');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to archive promo');
      setMessageType('error');
    } finally {
      setProcessingId(null);
    }
  };

  const openAddForm = () => {
    setSelectedPromo(null);
    setFormMode('add');
    setFormOpen(true);
  };

  const openEditForm = async (promo: PromoRecord) => {
    setProcessingId(promo._id);
    setMessage(null);
    try {
      const res = await fetch(`/api/promos/${promo._id}`, { headers: getAuthHeaders(), credentials: 'same-origin' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Unable to load promo for editing');
      }

      setSelectedPromo(data?.promo || promo);
      setFormMode('edit');
      setFormOpen(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load promo for editing');
      setMessageType('error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleSaved = () => {
    loadPromos();
    if (detailsPromo?._id) {
      handleOpenDetailsPage(detailsPromo._id);
    }
  };

  const handleOpenDetailsPage = async (promoId: string) => {
    setProcessingId(promoId);
    setMessage(null);
    try {
      const res = await fetch(`/api/promos/${promoId}`, { headers: getAuthHeaders(), credentials: 'same-origin' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.message || 'Unable to load promo details');
      }

      setDetailsPromo(data?.promo || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load promo details');
      setMessageType('error');
    } finally {
      setProcessingId(null);
    }
  };

  if (!active) return null;

  if (detailsPromo) {
    return (
      <>
        {message ? (
          <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : messageType === 'error' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300'}`}>
            {message}
          </div>
        ) : null}

        <PromoDetailsView
          promo={detailsPromo}
          processing={processingId === detailsPromo._id}
          onBack={() => setDetailsPromo(null)}
          onEdit={() => openEditForm(detailsPromo)}
          onToggleStatus={() => handleStatusToggle(detailsPromo)}
        />

        <PromoForm
          open={formOpen}
          mode={formMode}
          promoId={selectedPromo?._id || null}
          initialValues={selectedPromo ? {
            name: selectedPromo.name,
            code: selectedPromo.code,
            packagePrice: selectedPromo.packagePrice,
            status: selectedPromo.status,
            startDate: selectedPromo.startDate || '',
            endDate: selectedPromo.endDate || '',
            description: selectedPromo.description || '',
            notes: selectedPromo.notes || '',
            banner: selectedPromo.banner
              ? {
                  fileUrl: selectedPromo.banner.fileUrl || '',
                  altText: selectedPromo.banner.altText || '',
                }
              : null,
            inclusions: (selectedPromo.inclusions || []).map((inclusion, index) => ({
              id: inclusion._id || `${selectedPromo._id}-${index}`,
              type: typeof inclusion.type === 'string' && inclusion.type ? (inclusion.type as 'ROOM' | 'FACILITY' | 'FOOD' | 'AMENITY' | 'SERVICE' | 'DISCOUNT' | 'OTHER') : 'FACILITY',
              name: inclusion.name || '',
              description: inclusion.description || '',
              roomId: typeof inclusion.roomId === 'string' ? inclusion.roomId : inclusion.roomId?._id || '',
              quantity: Number(inclusion.quantity) > 0 ? Number(inclusion.quantity) : 1,
            })),
            includedRoomIds: (selectedPromo.includedRoomIds || []).map((room) => room._id || '').filter(Boolean),
            termsAndConditions: Array.isArray(selectedPromo.termsAndConditions) ? selectedPromo.termsAndConditions.join('\n') : '',
            additionalRoomDiscountType: selectedPromo.additionalRoomDiscount?.mode || 'NONE',
            additionalRoomDiscountValue:
              selectedPromo.additionalRoomDiscount && Number.isFinite(Number(selectedPromo.additionalRoomDiscount.value))
                ? Number(selectedPromo.additionalRoomDiscount.value)
                : '',
          } : null}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      </>
    );
  }

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Promo Management</p>
          <h2 className="text-2xl font-semibold text-white">Manage package promos and validity windows</h2>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
        >
          + Add Promo
        </button>
      </div>

      {message ? (
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${messageType === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : messageType === 'error' ? 'border-rose-500/20 bg-rose-500/10 text-rose-300' : 'border-sky-500/20 bg-sky-500/10 text-sky-300'}`}>
          {message}
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <span className="text-slate-500">🔎</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search promos..."
              className="w-48 bg-transparent text-sm outline-none"
            />
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <span className="text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="ALL" className="bg-slate-900">All</option>
              <option value="DRAFT" className="bg-slate-900">Draft</option>
              <option value="ACTIVE" className="bg-slate-900">Active</option>
              <option value="INACTIVE" className="bg-slate-900">Inactive</option>
              <option value="EXPIRED" className="bg-slate-900">Expired</option>
            </select>
          </label>

          <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
            <span className="text-slate-500">Validity</span>
            <select
              value={validityFilter}
              onChange={(event) => setValidityFilter(event.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="ALL" className="bg-slate-900">All</option>
              <option value="CURRENT" className="bg-slate-900">Currently valid</option>
              <option value="UPCOMING" className="bg-slate-900">Upcoming</option>
              <option value="EXPIRED" className="bg-slate-900">Expired</option>
            </select>
          </label>
        </div>

        <div className="text-sm text-slate-400">
          Showing {filteredPromos.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredPromos.length)} of {filteredPromos.length} promos
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-sm text-slate-400">
          Loading promos...
        </div>
      ) : filteredPromos.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-10 text-center text-sm text-slate-400">
          No promos match your current search or filter.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
              <thead className="bg-slate-900/70 text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-3 py-3">Image</th>
                  <th className="px-3 py-3">Promo Name</th>
                  <th className="px-3 py-3">Promo Code</th>
                  <th className="px-3 py-3">Package Price</th>
                  <th className="px-3 py-3">Validity</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pagedPromos.map((promo) => {
                  const currentlyValid = isCurrentlyValid(promo);
                  const bannerUrl = promo.banner?.fileUrl || '';
                  const showBanner = Boolean(bannerUrl) && !failedBannerUrls.has(bannerUrl);
                  const imageCount = showBanner ? 1 : 0;
                  return (
                    <tr key={promo._id} className="hover:bg-slate-900/60">
                      <td className="px-3 py-3">
                        <div className="flex h-12 w-20 items-center justify-center overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                          {showBanner ? (
                            <Image
                              src={promo.banner.fileUrl}
                              alt={promo.banner.altText || promo.name}
                              width={400}
                              height={300}
                              unoptimized
                              onError={() => {
                                setFailedBannerUrls((current) => {
                                  const next = new Set(current);
                                  next.add(bannerUrl);
                                  return next;
                                });
                              }}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Image</span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{imageCount} image{imageCount === 1 ? '' : 's'}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-white">{promo.name}</div>
                        <div className="mt-1 text-xs text-slate-500">{promo.description || 'No description provided.'}</div>
                      </td>
                      <td className="px-3 py-3">{promo.code}</td>
                      <td className="px-3 py-3">{formatPrice(promo.packagePrice)}</td>
                      <td className="px-3 py-3">
                        <div>{formatValidity(promo.startDate, promo.endDate)}</div>
                        <div className={`mt-1 text-[11px] ${currentlyValid ? 'text-emerald-400' : 'text-slate-500'}`}>
                          {currentlyValid ? 'Valid now' : 'Not currently valid'}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${promo.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' : promo.status === 'DRAFT' ? 'bg-sky-500/10 text-sky-300' : promo.status === 'EXPIRED' ? 'bg-rose-500/10 text-rose-300' : 'bg-slate-500/10 text-slate-300'}`}>
                          {promo.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenDetailsPage(promo._id)}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                          >
                            {processingId === promo._id ? 'Loading...' : 'View'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditForm(promo)}
                            disabled={processingId === promo._id}
                            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
                          >
                            {processingId === promo._id ? 'Loading...' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStatusToggle(promo)}
                            disabled={processingId === promo._id}
                            className="rounded-lg border border-amber-700/30 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
                          >
                            {processingId === promo._id
                              ? 'Saving...'
                              : promo.status === 'ACTIVE'
                                ? 'Deactivate'
                                : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchive(promo._id)}
                            disabled={processingId === promo._id}
                            className="rounded-lg border border-rose-700/30 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-900/20 disabled:opacity-60"
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              Page {safePage} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      <PromoForm
        open={formOpen}
        mode={formMode}
        promoId={selectedPromo?._id || null}
        initialValues={selectedPromo ? {
          name: selectedPromo.name,
          code: selectedPromo.code,
          packagePrice: selectedPromo.packagePrice,
          status: selectedPromo.status,
          startDate: selectedPromo.startDate || '',
          endDate: selectedPromo.endDate || '',
          description: selectedPromo.description || '',
          notes: selectedPromo.notes || '',
          banner: selectedPromo.banner
            ? {
                fileUrl: selectedPromo.banner.fileUrl || '',
                altText: selectedPromo.banner.altText || '',
              }
            : null,
          inclusions: (selectedPromo.inclusions || []).map((inclusion, index) => ({
            id: inclusion._id || `${selectedPromo._id}-${index}`,
            type: typeof inclusion.type === 'string' && inclusion.type ? (inclusion.type as 'ROOM' | 'FACILITY' | 'FOOD' | 'AMENITY' | 'SERVICE' | 'DISCOUNT' | 'OTHER') : 'FACILITY',
            name: inclusion.name || '',
            description: inclusion.description || '',
            roomId: typeof inclusion.roomId === 'string' ? inclusion.roomId : inclusion.roomId?._id || '',
            quantity: Number(inclusion.quantity) > 0 ? Number(inclusion.quantity) : 1,
          })),
          includedRoomIds: (selectedPromo.includedRoomIds || []).map((room) => room._id || '').filter(Boolean),
          termsAndConditions: Array.isArray(selectedPromo.termsAndConditions) ? selectedPromo.termsAndConditions.join('\n') : '',
          additionalRoomDiscountType: selectedPromo.additionalRoomDiscount?.mode || 'NONE',
          additionalRoomDiscountValue:
            selectedPromo.additionalRoomDiscount && Number.isFinite(Number(selectedPromo.additionalRoomDiscount.value))
              ? Number(selectedPromo.additionalRoomDiscount.value)
              : '',
        } : null}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </section>
  );
}