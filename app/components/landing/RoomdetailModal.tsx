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
  const [activeImageIndex, setActiveImageIndex] = React.useState(0);
  const [imageLoading, setImageLoading] = React.useState(true);
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
  const roomImages = room.images && room.images.length > 0
    ? room.images
    : room.primaryImage
      ? [{ fileUrl: room.primaryImage, altText: room.primaryImageAlt || room.name }]
      : [];
  const activeImage = roomImages[activeImageIndex] || roomImages[0];
  const changeImage = (nextIndex: number) => {
    setImageLoading(true);
    setActiveImageIndex(nextIndex);
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      style={{ backgroundColor: `${theme.navy}E6` }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl shadow-2xl md:flex-row"
        style={{ backgroundColor: theme.sand }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* room image */}
        <div className="relative h-64 w-full shrink-0 md:h-auto md:min-h-[620px] md:w-[44%]" style={{ backgroundColor: `${theme.royal}1A` }}>
          {activeImage ? (
            <Image
              src={activeImage.fileUrl}
              alt={activeImage.altText || room.name}
              fill
              unoptimized
              onLoad={() => setImageLoading(false)}
              className={`object-cover transition-all duration-500 ease-out ${imageLoading ? 'scale-105 opacity-0' : 'scale-100 opacity-100'}`}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm uppercase tracking-[0.3em]" style={{ color: `${theme.royal}99` }}>
              {room.code}
            </div>
          )}

          {imageLoading && activeImage ? (
            <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: `${theme.navy}26` }} aria-label="Loading room image">
              <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
            </div>
          ) : null}

          {roomImages.length > 1 ? (
            <>
              <button
                type="button"
                onClick={() => changeImage((activeImageIndex - 1 + roomImages.length) % roomImages.length)}
                aria-label="Previous room image"
                className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border text-2xl transition hover:scale-105"
                style={{ borderColor: `${theme.sand}99`, backgroundColor: `${theme.navy}B8`, color: theme.sand }}
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => changeImage((activeImageIndex + 1) % roomImages.length)}
                aria-label="Next room image"
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border text-2xl transition hover:scale-105"
                style={{ borderColor: `${theme.sand}99`, backgroundColor: `${theme.navy}B8`, color: theme.sand }}
              >
                ›
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${theme.navy}B8`, color: theme.sand }}>
                {activeImageIndex + 1} / {roomImages.length}
              </span>
            </>
          ) : null}

        </div>

        {/* room details */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4 border-b pb-5" style={{ borderColor: `${theme.ink}1A` }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.coral }}>Room details</p>
              <h3 className="mt-2 font-serif text-3xl" style={{ color: theme.caramel }}>{room.name}</h3>
              <p className="mt-2 text-sm" style={{ color: `${theme.ink}99` }}>Up to {room.maxGuests} guests <span className="mx-1" style={{ color: `${theme.ink}55` }}>•</span> {room.code}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close room details"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg font-semibold transition hover:bg-black/5"
              style={{ borderColor: `${theme.ink}33`, color: theme.navy }}
            >
              ×
            </button>
          </div>

          {room.description ? (
            <p className="mt-5 text-sm leading-relaxed" style={{ color: `${theme.ink}CC` }}>{room.description}</p>
          ) : null}

          {bedSummary ? (
            <div className="mt-6 rounded-xl border p-4" style={{ borderColor: `${theme.ink}1A`, backgroundColor: `${theme.royal}0D` }}>
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.royal }}>Sleeping arrangement</p>
              <p className="mt-2 text-sm" style={{ color: theme.ink }}>{bedSummary}</p>
            </div>
          ) : null}

          {room.features && room.features.length > 0 ? (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.royal }}>Room features</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {room.features.map((feature) => (
                  <Pill key={feature} label={feature} tone="royal" />
                ))}
              </div>
            </div>
          ) : null}

          {room.amenities && room.amenities.length > 0 ? (
            <div className="mt-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.coral }}>Amenities included</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {room.amenities.map((amenity) => (
                  <Pill key={amenity} label={amenity} tone="coral" />
                ))}
              </div>
            </div>
          ) : null}

          {/* pricing */}
          <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: `${theme.ink}1A`, backgroundColor: `${theme.sand}CC` }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: theme.royal }}>Rates</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
            href={`/reservation?room=${encodeURIComponent(room._id)}`}
            onClick={onClose}
            className="mt-7 block w-full rounded-full px-6 py-3.5 text-center text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 hover:opacity-90"
            style={{ backgroundColor: theme.sunset, color: theme.navy }}
          >
            Book this room now
          </Link>
        </div>
      </div>
    </div>
  );
}