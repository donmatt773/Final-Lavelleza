'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { theme } from '@/app/lib/landingTheme';
import { peso } from '@/app/lib/landingFormat';
import type { FeaturedRoom } from '@/app/lib/landingTypes';

type Props = {
  open: boolean;
  onClose: () => void;
  rooms: FeaturedRoom[];
};

export default function AllRoomsModal({ open, onClose, rooms }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);

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
  }, [open, onClose, rooms.length]);

  if (!open || rooms.length === 0) return null;

  const active = rooms[activeIndex] || rooms[0];
  const roomImages = active.images && active.images.length > 0
    ? active.images
    : active.primaryImage
      ? [{ fileUrl: active.primaryImage, altText: active.primaryImageAlt || active.name }]
      : [];
  const activeImage = roomImages[activeImageIndex] || roomImages[0];
  const changeImage = (nextIndex: number) => {
    setImageLoading(true);
    setActiveImageIndex(nextIndex);
  };
  const selectRoom = (index: number) => {
    setActiveIndex(index);
    setActiveImageIndex(0);
    setImageLoading(true);
  };

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      style={{ backgroundColor: `${theme.navy}E6` }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl shadow-2xl"
        style={{ backgroundColor: theme.sand }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b px-6 py-4" style={{ borderColor: `${theme.ink}1A` }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.royal }}>
              All Rooms &amp; Houses
            </p>
            <h3 className="font-serif text-xl" style={{ color: theme.caramel }}>
              {rooms.length} {rooms.length === 1 ? 'place' : 'places'} to stay
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border px-3 py-1.5 text-sm font-medium transition hover:opacity-70"
            style={{ borderColor: `${theme.ink}33`, color: theme.ink }}
          >
            Close
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row">
          <div className="relative flex min-h-[420px] flex-1 flex-col md:min-h-0 md:w-[58%]">
            <div className="relative min-h-64 flex-1" style={{ backgroundColor: `${theme.royal}1A` }}>
              {activeImage ? (
                <Image
                  src={activeImage.fileUrl}
                  alt={activeImage.altText || active.name}
                  fill
                  unoptimized
                  onLoad={() => setImageLoading(false)}
                  className={`object-cover transition-all duration-500 ease-out ${imageLoading ? 'scale-105 opacity-0' : 'scale-100 opacity-100'}`}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm uppercase tracking-[0.3em]" style={{ color: `${theme.royal}99` }}>
                  {active.code}
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
                    className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-2xl font-semibold transition hover:scale-105"
                    style={{ backgroundColor: `${theme.sand}E6`, color: theme.navy }}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => changeImage((activeImageIndex + 1) % roomImages.length)}
                    aria-label="Next room image"
                    className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-2xl font-semibold transition hover:scale-105"
                    style={{ backgroundColor: `${theme.sand}E6`, color: theme.navy }}
                  >
                    ›
                  </button>
                  <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${theme.navy}B8`, color: theme.sand }}>
                    {activeImageIndex + 1} / {roomImages.length}
                  </span>
                </>
              ) : null}
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.coral }}>Selected room</p>
              <h4 className="mt-2 font-serif text-2xl" style={{ color: theme.caramel }}>{active.name}</h4>
              <p className="mt-1 text-sm" style={{ color: `${theme.ink}99` }}>Up to {active.maxGuests} guests <span className="mx-1">•</span> {active.code}</p>
              {active.description ? <p className="mt-4 text-sm leading-6" style={{ color: `${theme.ink}99` }}>{active.description}</p> : null}
              {active.amenities && active.amenities.length > 0 ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: theme.coral }}>Amenities included</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {active.amenities.map((amenity) => (
                      <span key={amenity} className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: `${theme.coral}1A`, color: theme.coral }}>
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="mt-4 text-lg font-semibold" style={{ color: theme.royal }}>{peso(active.nightlyRate)} <span className="text-sm font-normal" style={{ color: `${theme.ink}80` }}>/ night</span></p>
            </div>
          </div>

          <aside className="flex min-h-0 flex-col border-t md:w-[42%] md:border-l md:border-t-0" style={{ borderColor: `${theme.ink}1A` }}>
            <div className="border-b px-5 py-4" style={{ borderColor: `${theme.ink}1A` }}>
              <p className="text-xs font-semibold uppercase tracking-[0.25em]" style={{ color: theme.royal }}>Choose a room</p>
              <p className="mt-1 text-sm" style={{ color: `${theme.ink}99` }}>Select a room to update the preview.</p>
            </div>
            <div className="grid flex-1 gap-2 overflow-y-auto p-4 sm:grid-cols-2 md:grid-cols-1">
              {rooms.map((room, index) => (
                <button
                  key={room._id}
                  type="button"
                  onClick={() => selectRoom(index)}
                  className="flex items-center gap-3 rounded-xl border p-2 text-left transition hover:-translate-y-0.5"
                  style={{
                    borderColor: index === activeIndex ? theme.sunset : `${theme.ink}1A`,
                    backgroundColor: index === activeIndex ? `${theme.sunset}12` : `${theme.sand}99`,
                  }}
                >
                  <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg" style={{ backgroundColor: `${theme.royal}1A` }}>
                    {room.primaryImage ? <Image src={room.primaryImage} alt={room.primaryImageAlt || room.name} fill unoptimized className="object-cover" /> : <span className="flex h-full items-center justify-center text-[9px]" style={{ color: theme.royal }}>{room.code}</span>}
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: theme.navy }}>{room.name}</span>
                    <span className="mt-1 block text-xs" style={{ color: `${theme.ink}80` }}>{peso(room.nightlyRate)} / night</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="border-t p-4" style={{ borderColor: `${theme.ink}1A` }}>
              <Link
                href={`/reservation?room=${encodeURIComponent(active._id)}`}
                onClick={onClose}
                className="block w-full rounded-full px-6 py-3 text-center text-sm font-semibold shadow-lg transition hover:-translate-y-0.5 hover:opacity-90"
                style={{ backgroundColor: theme.sunset, color: theme.navy }}
              >
                Book this room
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}