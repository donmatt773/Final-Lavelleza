'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';

type PromoStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED';

type LinkedRoom = {
  _id?: string;
  name?: string;
  code?: string;
  status?: string;
};

type PromoInclusion = {
  _id?: string;
  type?: string;
  name?: string;
  description?: string;
  quantity?: number;
  roomId?: LinkedRoom | string;
};

type AdditionalRoomDiscount = {
  mode?: 'PERCENT' | 'FIXED_AMOUNT';
  value?: number;
  notes?: string;
};

type PromoDetailsRecord = {
  _id: string;
  name: string;
  code: string;
  packagePrice: number;
  startDate?: string;
  endDate?: string;
  status: PromoStatus;
  description?: string;
  notes?: string;
  termsAndConditions?: string[];
  banner?: {
    fileUrl?: string;
    altText?: string;
  };
  inclusions?: PromoInclusion[];
  includedRoomIds?: LinkedRoom[];
  additionalRoomDiscount?: AdditionalRoomDiscount | null;
};

type Props = {
  promo: PromoDetailsRecord;
  processing: boolean;
  onBack: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
};

const formatPrice = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
};

function renderDiscount(value?: AdditionalRoomDiscount | null) {
  if (!value || !value.mode || value.value === undefined) {
    return 'No additional room discount';
  }

  if (value.mode === 'PERCENT') {
    return `${value.value}% discount`;
  }

  return `${formatPrice(value.value)} fixed discount`;
}

export default function PromoDetailsView({ promo, processing, onBack, onEdit, onToggleStatus }: Props) {
  const actionLabel = promo.status === 'ACTIVE' ? 'Deactivate' : 'Activate';
  const [failedBannerKey, setFailedBannerKey] = useState<string | null>(null);
  const bannerKey = `${promo._id}:${promo.banner?.fileUrl || ''}`;

  const showBanner = useMemo(
    () => Boolean(promo.banner?.fileUrl) && failedBannerKey !== bannerKey,
    [promo.banner?.fileUrl, failedBannerKey, bannerKey]
  );

  return (
    <section className="mt-4 rounded-3xl border border-slate-800 bg-linear-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30">
      <div className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-400">Promo Details</p>
          <h2 className="text-2xl font-semibold text-white">{promo.name}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Back to List
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={processing}
            className="rounded-lg border border-amber-700/30 px-4 py-2 text-sm text-amber-300 hover:bg-amber-900/20 disabled:opacity-60"
          >
            {processing ? 'Saving...' : actionLabel}
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
        <p className="mb-2 text-sm font-medium text-white">Promo Image</p>
        {showBanner ? (
          <Image
            src={promo.banner!.fileUrl!}
            alt={promo.banner?.altText || promo.name}
            width={1200}
            height={800}
            unoptimized
            onError={() => setFailedBannerKey(bannerKey)}
            className="h-auto max-h-120 w-full rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-xs uppercase tracking-[0.3em] text-slate-500">
            No Image
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          <p><span className="text-slate-500">Promo Name:</span> {promo.name}</p>
          <p className="mt-2"><span className="text-slate-500">Promo Code:</span> {promo.code}</p>
          <p className="mt-2"><span className="text-slate-500">Package Price:</span> {formatPrice(promo.packagePrice)}</p>
          <p className="mt-2"><span className="text-slate-500">Status:</span> {promo.status}</p>
          <p className="mt-2"><span className="text-slate-500">Valid From:</span> {formatDate(promo.startDate)}</p>
          <p className="mt-2"><span className="text-slate-500">Valid Until:</span> {formatDate(promo.endDate)}</p>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          <p className="font-medium text-white">Description</p>
          <p className="mt-2 text-slate-400">{promo.description || 'No description provided.'}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">Inclusions</p>
        {(promo.inclusions || []).length > 0 ? (
          <div className="mt-3 space-y-2">
            {(promo.inclusions || []).map((inclusion) => {
              const roomName =
                inclusion.type === 'ROOM' && inclusion.roomId && typeof inclusion.roomId === 'object'
                  ? inclusion.roomId.name || inclusion.name || 'Room Inclusion'
                  : inclusion.name || 'Inclusion';

              return (
                <div key={inclusion._id || `${inclusion.type ?? 'inclusion'}-${inclusion.name ?? 'unnamed'}`} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                  <p className="font-medium text-white">{roomName}</p>
                  {inclusion.description ? <p className="mt-1 text-slate-400">{inclusion.description}</p> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-slate-400">No inclusions configured.</p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">Rooms Included</p>
        {(promo.includedRoomIds || []).length > 0 ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {(promo.includedRoomIds || []).map((room) => (
              <div key={room._id || `${room.name ?? 'room'}-${room.code ?? 'no-code'}`} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                <p className="font-medium text-white">{room.name || 'Room'}</p>
                <p className="text-xs text-slate-500">{room.code || 'No code'}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-slate-400">No linked rooms.</p>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
        <p className="font-medium text-white">Additional Room Discount</p>
        <p className="mt-2 text-slate-400">{renderDiscount(promo.additionalRoomDiscount)}</p>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          <p className="font-medium text-white">Terms and Conditions</p>
          {Array.isArray(promo.termsAndConditions) && promo.termsAndConditions.length > 0 ? (
            <ul className="mt-2 space-y-1 text-slate-400">
              {promo.termsAndConditions.map((term, index) => (
                <li key={`${index}-${term}`}>• {term}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-slate-400">No terms provided.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
          <p className="font-medium text-white">Additional Notes</p>
          <p className="mt-2 text-slate-400">{promo.notes || 'No notes provided.'}</p>
        </div>
      </div>
    </section>
  );
}