'use client';

import React, { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { theme } from '@/app/lib/landingTheme';
import { peso } from '@/app/lib/landingFormat';
import type { FeaturedRoom } from '@/app/lib/landingTypes';

type Props = {
  room: FeaturedRoom | null;
  open: boolean;
  onClose: () => void;
};

function Pill({ label, tone }: { label: string; tone: 'royal' | 'coral' }) {
  const color = tone === 'royal' ? theme.royal : theme.coral;
  return (
    <span
      className="rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {label}
    </span>
  );
}

export default function RoomDetailModal({ room, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !room) return null;

  const bedSummary = (room.beds || []).map((bed) => `${bed.quantity} ${bed.name}`).join(' + ');

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      style={{ backgroundColor: `${theme.navy}E6` }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl shadow-2xl"
        style={{ backgroundColor: theme.sand }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* image */}
        <div className="relative h-56 w-full shrink-0 sm:h-72" style={{ backgroundColor: `${theme.royal}1A` }}>
          {room.primaryImage ? (
            <Image src={room.primaryImage} alt={room.primaryImageAlt || room.name} fill unoptimized className="object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm uppercase tracking-[0.3em]" style={{ color: `${theme.royal}99` }}>
              {room.code}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold transition hover:opacity-80"
            style={{ backgroundColor: `${theme.sand}E6`, color: theme.navy }}
          >
            ×
          </button>

          <div className="absolute inset-x-0 bottom-0 p-6" style={{ background: `linear-gradient(to top, ${theme.navy}F2, transparent)` }}>
            <h3 className="font-serif text-2xl" style={{ color: theme.sand }}>{room.name}</h3>
            <p className="mt-1 text-sm" style={{ color: `${theme.sand}CC` }}>Up to {room.maxGuests} guests · {room.code}</p>
          </div>
        </div>

        {/* details */}
        <div className="overflow-y-auto p-6">
          {room.description ? (
            <p className="text-sm leading-relaxed" style={{ color: `${theme.ink}CC` }}>{room.description}</p>
          ) : null}

          {bedSummary ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.royal }}>Sleeping arrangement</p>
              <p className="mt-2 text-sm" style={{ color: theme.ink }}>{bedSummary}</p>
            </div>
          ) : null}

          {room.features && room.features.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.royal }}>Room features</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {room.features.map((feature) => (
                  <Pill key={feature} label={feature} tone="royal" />
                ))}
              </div>
            </div>
          ) : null}

          {room.amenities && room.amenities.length > 0 ? (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.coral }}>Amenities included</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {room.amenities.map((amenity) => (
                  <Pill key={amenity} label={amenity} tone="coral" />
                ))}
              </div>
            </div>
          ) : null}

          {/* pricing */}
          <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: `${theme.ink}1A` }}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>Nightly rate</p>
                <p className="mt-1 text-lg font-semibold" style={{ color: theme.royal }}>{peso(room.nightlyRate)}</p>
              </div>
              {room.halfDayRate ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>Half day</p>
                  <p className="mt-1 text-lg font-semibold" style={{ color: theme.ink }}>{peso(room.halfDayRate)}</p>
                </div>
              ) : null}
              {room.wholeDayRate ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>Whole day (day use)</p>
                  <p className="mt-1 text-lg font-semibold" style={{ color: theme.ink }}>{peso(room.wholeDayRate)}</p>
                </div>
              ) : null}
            </div>
          </div>

          <Link
            href="/reservation"
            onClick={onClose}
            className="mt-6 block w-full rounded-full px-6 py-3 text-center text-sm font-semibold transition hover:opacity-90"
            style={{ backgroundColor: theme.sunset, color: theme.navy }}
          >
            Book {room.name}
          </Link>
        </div>
      </div>
    </div>
  );
}