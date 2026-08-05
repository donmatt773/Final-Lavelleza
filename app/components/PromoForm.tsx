'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

type RoomOption = {
  _id: string;
  name: string;
  code: string;
};

type PromoImageFormValue = {
  fileUrl: string;
  storageKey?: string;
  altText?: string;
};

type InclusionType = 'ROOM' | 'FACILITY' | 'FOOD' | 'AMENITY' | 'SERVICE' | 'DISCOUNT' | 'OTHER';

type InclusionFormValue = {
  id: string;
  type: InclusionType;
  name: string;
  description: string;
  roomId: string;
  quantity: number;
};

type AdditionalRoomDiscountType = 'NONE' | 'PERCENT' | 'FIXED_AMOUNT';

type PromoFormValues = {
  name: string;
  code: string;
  packagePrice: number;
  status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';
  startDate: string;
  endDate: string;
  description: string;
  banner: PromoImageFormValue | null;
  inclusions: InclusionFormValue[];
  includedRoomIds: string[];
  includedPax: number | '';
  additionalRoomDiscountType: AdditionalRoomDiscountType;
  additionalRoomDiscountValue: number | '';
  termsAndConditions: string;
  notes: string;
};

type Props = {
  open: boolean;
  mode: 'add' | 'edit';
  promoId?: string | null;
  initialValues?: Partial<PromoFormValues> | null;
  onClose: () => void;
  onSaved: () => void;
};

const inclusionTypes: InclusionType[] = ['ROOM', 'FACILITY', 'FOOD', 'AMENITY', 'SERVICE', 'DISCOUNT', 'OTHER'];

const isInclusionType = (value: unknown): value is InclusionType =>
  typeof value === 'string' && inclusionTypes.includes(value as InclusionType);

const initialValuesFactory = (): PromoFormValues => ({
  name: '',
  code: '',
  packagePrice: 0,
  status: 'DRAFT',
  startDate: '',
  endDate: '',
  description: '',
  banner: null,
  inclusions: [],
  includedRoomIds: [],
  includedPax: '',
  additionalRoomDiscountType: 'NONE',
  additionalRoomDiscountValue: '',
  termsAndConditions: '',
  notes: '',
});

const formatCurrency = (value: number | '') => {
  const safeValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(safeValue);
};

const toDateInputValue = (value?: string | Date) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const randomId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const getAuthHeaders = () => ({
  // session cookie is used for authorization on the server
});

const getJsonHeaders = () => ({
  'Content-Type': 'application/json',
});

export default function PromoForm({ open, mode, promoId, initialValues, onClose, onSaved }: Props) {
  const [form, setForm] = useState<PromoFormValues>(initialValuesFactory());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [roomOptions, setRoomOptions] = useState<RoomOption[]>([]);
  const [roomLoading, setRoomLoading] = useState(false);
  const [bannerAction, setBannerAction] = useState<'unchanged' | 'updated' | 'removed'>('unchanged');

  const loadRooms = React.useCallback(async () => {
    setRoomLoading(true);
    try {
      const res = await fetch('/api/rooms', { headers: getAuthHeaders(), credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Unable to load rooms');
      }

      const rooms = Array.isArray(data)
        ? data.map((room) => ({
            _id: String(room._id),
            name: String(room.name || ''),
            code: String(room.code || ''),
          }))
        : [];

      setRoomOptions(rooms);
    } catch {
      setRoomOptions([]);
    } finally {
      setRoomLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => {
      void loadRooms();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [open, loadRooms]);

  useEffect(() => {
    if (!open) return;

    const defaults = initialValuesFactory();
    const mappedInclusions = Array.isArray(initialValues?.inclusions)
      ? initialValues!.inclusions.map((item) => ({
          id: item.id || randomId(),
          type: isInclusionType(item.type) ? item.type : 'FACILITY',
          name: item.name || '',
          description: item.description || '',
          roomId: item.roomId || '',
          quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
        }))
      : [];

    const timeoutId = window.setTimeout(() => {
      setForm({
        ...defaults,
        ...initialValues,
        startDate: toDateInputValue(initialValues?.startDate as string | Date),
        endDate: toDateInputValue(initialValues?.endDate as string | Date),
        inclusions: mappedInclusions,
        banner: initialValues?.banner || null,
        includedRoomIds: Array.isArray(initialValues?.includedRoomIds) ? initialValues!.includedRoomIds : [],
        termsAndConditions: initialValues?.termsAndConditions || '',
        additionalRoomDiscountType: initialValues?.additionalRoomDiscountType || 'NONE',
        additionalRoomDiscountValue:
          initialValues?.additionalRoomDiscountValue !== undefined
            ? initialValues.additionalRoomDiscountValue
            : '',
      });
      setBannerAction('unchanged');
      setErrors({});
      setServerMessage(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [open, initialValues]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) nextErrors.name = 'Promo name is required.';
    if (!form.code.trim()) nextErrors.code = 'Promo code is required.';

    if (!Number.isFinite(Number(form.packagePrice)) || Number(form.packagePrice) < 0) {
      nextErrors.packagePrice = 'Package price must be zero or more.';
    }

    if (form.startDate && form.endDate) {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      if (end < start) {
        nextErrors.endDate = 'End date must be greater than or equal to start date.';
      }
    }

    if (form.status === 'ACTIVE' && (!form.startDate || !form.endDate)) {
      nextErrors.status = 'ACTIVE promos require start date and end date.';
    }

    if (form.includedPax !== '' && (!Number.isFinite(Number(form.includedPax)) || Number(form.includedPax) < 1)) {
      nextErrors.includedPax = 'Included pax must be a number greater than or equal to 1.';
    }

    form.inclusions.forEach((inclusion, index) => {
      if (!inclusion.type) {
        nextErrors[`inclusion-type-${index}`] = 'Inclusion type is required.';
      }

      if (inclusion.type === 'ROOM') {
        if (!inclusion.roomId) {
          nextErrors[`inclusion-room-${index}`] = 'Room selection is required for ROOM inclusion.';
        }
        if (!Number.isFinite(Number(inclusion.quantity)) || Number(inclusion.quantity) < 1) {
          nextErrors[`inclusion-quantity-${index}`] = 'Room quantity must be a number greater than or equal to 1.';
        }
      } else {
        if (!inclusion.name.trim()) {
          nextErrors[`inclusion-name-${index}`] = 'Inclusion name is required.';
        }
      }
    });

    if (
      form.additionalRoomDiscountType !== 'NONE' &&
      (!Number.isFinite(Number(form.additionalRoomDiscountValue)) || Number(form.additionalRoomDiscountValue) < 0)
    ) {
      nextErrors.additionalRoomDiscountValue = 'Discount value must be zero or more.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const inclusionSummary = useMemo(() => {
    if (!form.inclusions.length) return 'No inclusions configured yet';
    return `${form.inclusions.length} inclusion${form.inclusions.length > 1 ? 's' : ''} configured`;
  }, [form.inclusions]);

  const addInclusion = () => {
    setForm((current) => ({
      ...current,
      inclusions: [
        ...current.inclusions,
        {
          id: randomId(),
          type: 'FACILITY',
          name: '',
          description: '',
          roomId: '',
          quantity: 1,
        },
      ],
    }));
  };

  const removeInclusion = (id: string) => {
    setForm((current) => ({
      ...current,
      inclusions: current.inclusions.filter((item) => item.id !== id),
    }));
  };

  const updateInclusion = (id: string, key: keyof InclusionFormValue, value: string | number) => {
    setForm((current) => ({
      ...current,
      inclusions: current.inclusions.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [key]: value };

        if (key === 'type' && value !== 'ROOM') {
          updated.roomId = '';
        }

        if (key === 'type' && value === 'ROOM') {
          updated.name = '';
          updated.quantity = Number(updated.quantity) >= 1 ? Number(updated.quantity) : 1;
        }

        if (key === 'quantity') {
          const nextQuantity = Number(value);
          updated.quantity = Number.isFinite(nextQuantity) && nextQuantity >= 1 ? nextQuantity : 1;
        }

        return updated;
      }),
    }));

    if (key === 'roomId' && typeof value === 'string' && value) {
      setForm((current) => ({
        ...current,
        includedRoomIds: current.includedRoomIds.includes(value)
          ? current.includedRoomIds
          : [...current.includedRoomIds, value],
      }));
    }
  };

  const toggleIncludedRoom = (roomId: string) => {
    setForm((current) => ({
      ...current,
      includedRoomIds: current.includedRoomIds.includes(roomId)
        ? current.includedRoomIds.filter((id) => id !== roomId)
        : [...current.includedRoomIds, roomId],
    }));
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setServerMessage(null);
      const data = new FormData();
      data.append('files', file);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: data,
        credentials: 'same-origin',
      });

      const result = await res.json();
      if (!res.ok || !result?.success || !Array.isArray(result.images) || !result.images.length) {
        throw new Error(result?.message || 'Unable to upload promo image');
      }

      const uploaded = result.images[0];
      setForm((current) => ({
        ...current,
        banner: {
          fileUrl: uploaded.fileUrl,
          storageKey: uploaded.storageKey,
          altText: uploaded.altText || form.name || 'Promo image',
        },
      }));
      setBannerAction('updated');
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : 'Unable to upload promo image');
    }

    event.target.value = '';
  };

  const removeImage = () => {
    setForm((current) => ({ ...current, banner: null }));
    setBannerAction('removed');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerMessage(null);

    try {
      const inclusions = form.inclusions.map((item, index) => {
        const roomDoc = roomOptions.find((room) => room._id === item.roomId);
        const inclusion: Record<string, unknown> = {
          type: item.type,
          sortOrder: index + 1,
          description: item.description.trim() || undefined,
          quantity: Number(item.quantity) >= 1 ? Number(item.quantity) : 1,
        };

        if (item.type === 'ROOM') {
          inclusion.roomId = item.roomId;
          inclusion.name = roomDoc?.name || 'Room Inclusion';
          inclusion.quantity = Number(item.quantity) >= 1 ? Number(item.quantity) : 1;
        } else {
          inclusion.name = item.name.trim();
        }

        return inclusion;
      });

      const termsAndConditions = form.termsAndConditions
        .split('\n')
        .map((term) => term.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        packagePrice: Number(form.packagePrice),
        status: form.status,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        description: form.description.trim(),
        inclusions,
        includedRoomIds: Array.from(new Set(form.includedRoomIds)),
        includedPax: form.includedPax === '' ? undefined : Number(form.includedPax),
        termsAndConditions,
        notes: form.notes.trim(),
      };

      if (mode === 'add') {
        payload.banner = form.banner || undefined;
      } else if (bannerAction === 'updated') {
        payload.banner = form.banner || undefined;
      } else if (bannerAction === 'removed') {
        payload.banner = null;
      }

      if (form.additionalRoomDiscountType !== 'NONE') {
        payload.additionalRoomDiscount = {
          mode: form.additionalRoomDiscountType,
          value: Number(form.additionalRoomDiscountValue || 0),
          appliesToRoomIds: Array.from(new Set(form.includedRoomIds)),
        };
      } else if (mode === 'edit') {
        payload.additionalRoomDiscount = null;
      }

      const finalUrl = mode === 'edit' && promoId ? `/api/promos/${promoId}` : '/api/promos';
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const response = await fetch(finalUrl, {
        method,
        headers: { ...getJsonHeaders(), ...getAuthHeaders() },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      });

      const data = await response.json();
      if (!response.ok) {
        const combinedError = Array.isArray(data?.errors) ? data.errors.join(' ') : data?.message;
        throw new Error(combinedError || 'Unable to save promo');
      }

      setServerMessage(mode === 'edit' ? 'Promo updated successfully.' : 'Promo created successfully.');
      onSaved();
      onClose();
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : 'Unable to save promo');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50">
        <div className="mb-5 flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">
              {mode === 'edit' ? 'Edit Promo' : 'Add Promo'}
            </p>
            <h3 className="text-2xl font-semibold text-white">
              {mode === 'edit' ? 'Update package promo' : 'Create package promo'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">Close</button>
        </div>

        {serverMessage ? (
          <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${serverMessage.includes('successfully') ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/20 bg-rose-500/10 text-rose-300'}`}>
            {serverMessage}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">1. Basic Information</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Promo Name</label>
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
                {errors.name ? <p className="mt-1 text-xs text-rose-400">{errors.name}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Promo Code</label>
                <input
                  value={form.code}
                  onChange={(event) => setForm({ ...form, code: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
                {errors.code ? <p className="mt-1 text-xs text-rose-400">{errors.code}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Package Price</label>
                <input
                  type="number"
                  min="0"
                  value={form.packagePrice}
                  onChange={(event) => setForm({ ...form, packagePrice: Number(event.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
                <div className="mt-2 text-xs text-slate-500">Preview: {formatCurrency(form.packagePrice)}</div>
                {errors.packagePrice ? <p className="mt-1 text-xs text-rose-400">{errors.packagePrice}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => setForm({ ...form, status: event.target.value as PromoFormValues['status'] })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
                {errors.status ? <p className="mt-1 text-xs text-rose-400">{errors.status}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Start Date</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm({ ...form, startDate: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">End Date</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm({ ...form, endDate: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
                {errors.endDate ? <p className="mt-1 text-xs text-rose-400">{errors.endDate}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Included Guests / Pax</label>
                <input
                  type="number"
                  min="1"
                  value={form.includedPax}
                  onChange={(event) => setForm({ ...form, includedPax: event.target.value === '' ? '' : Number(event.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
                {errors.includedPax ? <p className="mt-1 text-xs text-rose-400">{errors.includedPax}</p> : null}
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm text-slate-300">Description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">2. Promo Image</h4>
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/70 px-4 py-6 text-sm text-slate-400 hover:bg-slate-800">
              <span>{form.banner ? 'Replace promo image' : 'Upload promo image'}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>

            {form.banner?.fileUrl ? (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <Image src={form.banner.fileUrl} alt={form.banner.altText || 'Promo preview'} width={1200} height={800} className="h-40 w-full rounded-lg object-cover" />
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={removeImage}
                    className="rounded-lg border border-rose-700/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-900/20"
                  >
                    Remove Image
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">3. Promo Inclusions</h4>
              <button type="button" onClick={addInclusion} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">+ Add Inclusion</button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-400">{inclusionSummary}</div>

            <div className="mt-3 space-y-3">
              {form.inclusions.map((inclusion, index) => (
                <div key={inclusion.id} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 md:grid-cols-12">
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-sm text-slate-300">Type</label>
                    <select
                      value={inclusion.type}
                      onChange={(event) => updateInclusion(inclusion.id, 'type', event.target.value as InclusionType)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                    >
                      {inclusionTypes.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  {inclusion.type === 'ROOM' ? (
                    <>
                      <div className="md:col-span-4">
                        <label className="mb-2 block text-sm text-slate-300">Room</label>
                        <select
                          value={inclusion.roomId}
                          onChange={(event) => updateInclusion(inclusion.id, 'roomId', event.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        >
                          <option value="">Select a room</option>
                          {roomOptions.map((room) => (
                            <option key={room._id} value={room._id}>{room.name} ({room.code})</option>
                          ))}
                        </select>
                        {errors[`inclusion-room-${index}`] ? <p className="mt-1 text-xs text-rose-400">{errors[`inclusion-room-${index}`]}</p> : null}
                      </div>
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-sm text-slate-300">Quantity</label>
                        <input
                          type="number"
                          min="1"
                          value={inclusion.quantity}
                          onChange={(event) => updateInclusion(inclusion.id, 'quantity', Number(event.target.value))}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        />
                        {errors[`inclusion-quantity-${index}`] ? <p className="mt-1 text-xs text-rose-400">{errors[`inclusion-quantity-${index}`]}</p> : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="md:col-span-4">
                        <label className="mb-2 block text-sm text-slate-300">Name</label>
                        <input
                          value={inclusion.name}
                          onChange={(event) => updateInclusion(inclusion.id, 'name', event.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                        />
                        {errors[`inclusion-name-${index}`] ? <p className="mt-1 text-xs text-rose-400">{errors[`inclusion-name-${index}`]}</p> : null}
                      </div>
                    </>
                  )}

                  <div className={inclusion.type === 'ROOM' ? 'md:col-span-3' : 'md:col-span-5'}>
                    <label className="mb-2 block text-sm text-slate-300">Description</label>
                    <textarea
                      rows={2}
                      value={inclusion.description}
                      onChange={(event) => updateInclusion(inclusion.id, 'description', event.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="md:col-span-1 flex items-end justify-end">
                    <button type="button" onClick={() => removeInclusion(inclusion.id)} className="rounded-lg border border-rose-700/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-900/20">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">4. Included Rooms</h4>
            {roomLoading ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-400">Loading rooms...</div>
            ) : roomOptions.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-400">No rooms available.</div>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {roomOptions.map((room) => {
                  const selected = form.includedRoomIds.includes(room._id);
                  return (
                    <button
                      key={room._id}
                      type="button"
                      onClick={() => toggleIncludedRoom(room._id)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${selected ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:bg-slate-800'}`}
                    >
                      <div className="font-medium">{room.name}</div>
                      <div className="text-xs text-slate-500">{room.code}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">5. Additional Room Discount</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Additional Room Discount Type</label>
                <select
                  value={form.additionalRoomDiscountType}
                  onChange={(event) => setForm({ ...form, additionalRoomDiscountType: event.target.value as AdditionalRoomDiscountType })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                >
                  <option value="NONE">None</option>
                  <option value="PERCENT">Percentage</option>
                  <option value="FIXED_AMOUNT">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Discount Value</label>
                <input
                  type="number"
                  min="0"
                  disabled={form.additionalRoomDiscountType === 'NONE'}
                  value={form.additionalRoomDiscountValue}
                  onChange={(event) => setForm({ ...form, additionalRoomDiscountValue: event.target.value === '' ? '' : Number(event.target.value) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500 disabled:opacity-50"
                />
                {errors.additionalRoomDiscountValue ? <p className="mt-1 text-xs text-rose-400">{errors.additionalRoomDiscountValue}</p> : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">6. Terms and Notes</h4>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Terms and Conditions</label>
                <textarea
                  rows={4}
                  value={form.termsAndConditions}
                  onChange={(event) => setForm({ ...form, termsAndConditions: event.target.value })}
                  placeholder="One term per line"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Additional Notes</label>
                <textarea
                  rows={4}
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {submitting ? 'Saving...' : 'Save Promo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}