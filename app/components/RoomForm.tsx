'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';

type BedEntry = {
  id: string;
  bedTypeId: string;
  quantity: number;
};

type ImageEntry = {
  id: string;
  fileUrl: string;
  storageKey?: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
};

type RoomFormValues = {
  name: string;
  code: string;
  maxGuests: number;
  status: string;
  description: string;
  nightlyRate: number;
  halfDayRate: number;
  wholeDayRate: number;
  beds: BedEntry[];
  features: string[];
  amenities: string[];
  images: ImageEntry[];
};

type Props = {
  open: boolean;
  mode: 'add' | 'edit';
  roomId?: string | null;
  initialValues?: RoomFormValues | null;
  onClose: () => void;
  onSaved: () => void;
};

const createClientId = () => {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const initialValuesFactory = (): RoomFormValues => ({
  name: '',
  code: '',
  maxGuests: 1,
  status: 'AVAILABLE',
  description: '',
  nightlyRate: 0,
  halfDayRate: 0,
  wholeDayRate: 0,
  beds: [
    { id: createClientId(), bedTypeId: 'Double Bed', quantity: 1 },
  ],
  features: [],
  amenities: [],
  images: [],
});

const bedTypeOptions = ['Single Bed', 'Double Bed', 'Double Deck Bed'];
const featureOptions = ['Kitchen', 'Dipping Pool', 'Private Pool', 'Private Bathroom', 'Dining Area', 'Refrigerator', 'Balcony'];
const amenityOptions = ['Complimentary Breakfast', 'Bottled Water', 'Air Conditioning', 'Swimming Pool', 'Private Comfort Room', 'Smart TV', 'Free Wi-Fi', 'Personalized Guest Kits'];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value);

export default function RoomForm({ open, mode, roomId, initialValues, onClose, onSaved }: Props) {
  const [form, setForm] = useState<RoomFormValues>(initialValuesFactory());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const getAuthHeaders = () => {
    const role = localStorage.getItem('auth_role') || '';
    return {
      'x-user-role': role,
    };
  };

  useEffect(() => {
    if (!open) return;

    const timeoutId = window.setTimeout(() => {
      setForm(initialValues ? {
        ...initialValues,
        features: Array.from(new Set(initialValues.features || [])),
        amenities: Array.from(new Set(initialValues.amenities || [])),
        beds: initialValues.beds?.length ? initialValues.beds : [{ id: createClientId(), bedTypeId: 'Double Bed', quantity: 1 }],
        images: initialValues.images || [],
      } : initialValuesFactory());
      setErrors({});
      setServerMessage(null);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [open, initialValues]);

  const bedSummary = useMemo(() => {
    if (!form.beds.length) return 'No beds added';
    return form.beds.map((bed) => `${bed.quantity} ${bed.bedTypeId}`).join(' + ');
  }, [form.beds]);

  const validate = () => {
    const nextErrors: Record<string, string> = {};

    if (!form.name.trim()) nextErrors.name = 'Room name is required.';
    if (!form.code.trim()) nextErrors.code = 'Room code is required.';
    if (!Number.isFinite(form.maxGuests) || form.maxGuests < 1) nextErrors.maxGuests = 'Capacity must be greater than zero.';
    if (!Number.isFinite(form.nightlyRate) || form.nightlyRate < 0) nextErrors.nightlyRate = 'Nightly rate must be zero or more.';
    if (!Number.isFinite(form.halfDayRate) || form.halfDayRate < 0) nextErrors.halfDayRate = 'Half-day rate must be zero or more.';
    if (!Number.isFinite(form.wholeDayRate) || form.wholeDayRate < 0) nextErrors.wholeDayRate = 'Whole-day rate must be zero or more.';

    form.beds.forEach((bed, index) => {
      if (!bed.bedTypeId.trim()) {
        nextErrors[`bed-${index}`] = 'Each bed row needs a bed type.';
      }
      if (!Number.isFinite(bed.quantity) || bed.quantity < 1) {
        nextErrors[`bedQuantity-${index}`] = 'Bed quantity must be greater than zero.';
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerMessage(null);

    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        maxGuests: Number(form.maxGuests),
        status: form.status,
        nightlyRate: Number(form.nightlyRate),
        halfDayRate: Number(form.halfDayRate),
        wholeDayRate: Number(form.wholeDayRate),
        beds: form.beds.map((bed) => ({ bedTypeId: bed.bedTypeId, quantity: Number(bed.quantity) })),
        features: Array.from(new Set(form.features)),
        amenities: Array.from(new Set(form.amenities)),
        images: form.images.map((image) => ({
          fileUrl: image.fileUrl,
          storageKey: image.storageKey,
          altText: image.altText.trim(),
          sortOrder: image.sortOrder,
          isPrimary: image.isPrimary,
        })),
        primaryImageId: null,
      };

      const method = mode === 'edit' ? 'PUT' : 'POST';
      const finalUrl = mode === 'edit' && roomId ? `/api/rooms/${roomId}` : '/api/rooms';

      const response = await fetch(finalUrl, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Unable to save room');
      }

      setServerMessage(mode === 'edit' ? 'Room updated successfully.' : 'Room created successfully.');
      onSaved();
      onClose();
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : 'Unable to save room');
    } finally {
      setSubmitting(false);
    }
  };

  const addBed = () => {
    setForm((current) => ({
      ...current,
      beds: [...current.beds, { id: createClientId(), bedTypeId: 'Double Bed', quantity: 1 }],
    }));
  };

  const removeBed = (bedId: string) => {
    setForm((current) => ({
      ...current,
      beds: current.beds.filter((bed) => bed.id !== bedId),
    }));
  };

  const updateBed = (bedId: string, field: 'bedTypeId' | 'quantity', value: string | number) => {
    setForm((current) => ({
      ...current,
      beds: current.beds.map((bed) => (bed.id === bedId ? { ...bed, [field]: field === 'quantity' ? Number(value) : value } : bed)),
    }));
  };

  const toggleSelection = (list: 'features' | 'amenities', value: string) => {
    setForm((current) => ({
      ...current,
      [list]: current[list].includes(value)
        ? current[list].filter((item) => item !== value)
        : [...current[list], value],
    }));
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    try {
      const data = new FormData();
      files.forEach((file) => data.append('files', file));

      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: data,
      });

      const result = await res.json();
      if (!res.ok || !result?.success) {
        throw new Error(result?.message || 'Unable to upload images');
      }

      const uploaded = Array.isArray(result.images) ? result.images : [];

      setForm((current) => {
        const nextImages = uploaded.map((image: { fileUrl: string; storageKey?: string; altText?: string }, index: number) => ({
          id: createClientId(),
          fileUrl: image.fileUrl,
          storageKey: image.storageKey,
          altText: image.altText || `Room image ${current.images.length + index + 1}`,
          sortOrder: current.images.length + index + 1,
          isPrimary: current.images.length === 0 && index === 0,
        }));

        return {
          ...current,
          images: [...current.images, ...nextImages],
        };
      });
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : 'Unable to upload images');
    }

    event.target.value = '';
  };

  const removeImage = (imageId: string) => {
    setForm((current) => {
      const filtered = current.images.filter((image) => image.id !== imageId);
      return {
        ...current,
        images: filtered.map((image, index) => ({ ...image, sortOrder: index + 1, isPrimary: index === 0 && filtered.length > 0 ? true : false })),
      };
    });
  };

  const setPrimaryImage = (imageId: string) => {
    setForm((current) => ({
      ...current,
      images: current.images.map((image, index) => ({
        ...image,
        isPrimary: image.id === imageId,
        sortOrder: index + 1,
      })),
    }));
  };

  const moveImage = (fromIndex: number, direction: -1 | 1) => {
    const targetIndex = fromIndex + direction;
    if (targetIndex < 0 || targetIndex >= form.images.length) return;
    setForm((current) => {
      const images = [...current.images];
      const [item] = images.splice(fromIndex, 1);
      images.splice(targetIndex, 0, item);
      const currentPrimaryId = current.images.find((image) => image.isPrimary)?.id;
      return {
        ...current,
        images: images.map((image, index) => ({
          ...image,
          sortOrder: index + 1,
          isPrimary: currentPrimaryId ? image.id === currentPrimaryId : index === 0,
        })),
      };
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6">
      <div className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/50">
        <div className="mb-5 flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">{mode === 'edit' ? 'Edit Room' : 'Add Room'}</p>
            <h3 className="text-2xl font-semibold text-white">{mode === 'edit' ? 'Update room information' : 'Create a new room record'}</h3>
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
                <label className="mb-2 block text-sm text-slate-300">Room Name</label>
                <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                {errors.name ? <p className="mt-1 text-xs text-rose-400">{errors.name}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Room Code</label>
                <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                {errors.code ? <p className="mt-1 text-xs text-rose-400">{errors.code}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Maximum Guests</label>
                <input type="number" min="1" value={form.maxGuests} onChange={(event) => setForm({ ...form, maxGuests: Number(event.target.value) })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                {errors.maxGuests ? <p className="mt-1 text-xs text-rose-400">{errors.maxGuests}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Status</label>
                <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500">
                  <option value="AVAILABLE">AVAILABLE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm text-slate-300">Description</label>
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h4 className="text-lg font-semibold text-white">2. Bed Configuration</h4>
              <button type="button" onClick={addBed} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">+ Add Bed</button>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-sm text-slate-400">Current layout: {bedSummary}</div>
            <div className="mt-3 space-y-3">
              {form.beds.map((bed, index) => (
                <div key={bed.id} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3 md:grid-cols-[1fr_140px_auto]">
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Bed Type</label>
                    <select value={bed.bedTypeId} onChange={(event) => updateBed(bed.id, 'bedTypeId', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500">
                      {bedTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                    {errors[`bed-${index}`] ? <p className="mt-1 text-xs text-rose-400">{errors[`bed-${index}`]}</p> : null}
                  </div>
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Quantity</label>
                    <input type="number" min="1" value={bed.quantity} onChange={(event) => updateBed(bed.id, 'quantity', event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                    {errors[`bedQuantity-${index}`] ? <p className="mt-1 text-xs text-rose-400">{errors[`bedQuantity-${index}`]}</p> : null}
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={() => removeBed(bed.id)} className="rounded-lg border border-rose-700/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-900/20">Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">3. Pricing</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm text-slate-300">Nightly Rate</label>
                <input type="number" min="0" value={form.nightlyRate} onChange={(event) => setForm({ ...form, nightlyRate: Number(event.target.value) })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                <div className="mt-2 text-xs text-slate-500">Preview: {formatCurrency(form.nightlyRate)}</div>
                {errors.nightlyRate ? <p className="mt-1 text-xs text-rose-400">{errors.nightlyRate}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Half-Day Rate</label>
                <input type="number" min="0" value={form.halfDayRate} onChange={(event) => setForm({ ...form, halfDayRate: Number(event.target.value) })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                <div className="mt-2 text-xs text-slate-500">Preview: {formatCurrency(form.halfDayRate)}</div>
                {errors.halfDayRate ? <p className="mt-1 text-xs text-rose-400">{errors.halfDayRate}</p> : null}
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-300">Whole-Day Rate</label>
                <input type="number" min="0" value={form.wholeDayRate} onChange={(event) => setForm({ ...form, wholeDayRate: Number(event.target.value) })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500" />
                <div className="mt-2 text-xs text-slate-500">Preview: {formatCurrency(form.wholeDayRate)}</div>
                {errors.wholeDayRate ? <p className="mt-1 text-xs text-rose-400">{errors.wholeDayRate}</p> : null}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">4. Features</h4>
            <div className="flex flex-wrap gap-2">
              {featureOptions.map((option) => {
                const selected = form.features.includes(option);
                return (
                  <button key={option} type="button" onClick={() => toggleSelection('features', option)} className={`rounded-full border px-3 py-1.5 text-sm ${selected ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                    {option}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">5. Amenities</h4>
            <div className="flex flex-wrap gap-2">
              {amenityOptions.map((option) => {
                const selected = form.amenities.includes(option);
                return (
                  <button key={option} type="button" onClick={() => toggleSelection('amenities', option)} className={`rounded-full border px-3 py-1.5 text-sm ${selected ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300 hover:bg-slate-800'}`}>
                    {option}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <h4 className="mb-4 text-lg font-semibold text-white">6. Images</h4>
            <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/70 px-4 py-6 text-sm text-slate-400 hover:bg-slate-800">
              <span>Upload room images</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </label>
            {form.images.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {form.images.map((image, index) => (
                  <div key={image.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                    <Image src={image.fileUrl} alt={image.altText || 'Room preview'} width={1200} height={800} className="h-32 w-full rounded-lg object-cover" />
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-400">Image {index + 1}</span>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setPrimaryImage(image.id)} className={`rounded-lg border px-2 py-1 text-xs ${image.isPrimary ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-300'}`}>
                          {image.isPrimary ? 'Primary' : 'Set Primary'}
                        </button>
                        <button type="button" onClick={() => moveImage(index, -1 as 1 | -1)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">↑</button>
                        <button type="button" onClick={() => moveImage(index, 1 as 1 | -1)} className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">↓</button>
                        <button type="button" onClick={() => removeImage(image.id)} className="rounded-lg border border-rose-700/40 px-2 py-1 text-xs text-rose-300">Remove</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60">
              {submitting ? 'Saving...' : mode === 'edit' ? 'Save Changes' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
