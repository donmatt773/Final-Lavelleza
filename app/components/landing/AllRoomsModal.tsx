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

  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setActiveIndex((current) => Math.min(rooms.length - 1, current + 1));
      if (event.key === 'ArrowLeft') setActiveIndex((current) => Math.max(0, current - 1));
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

        <div className="overflow-y-auto">
          {/* hero preview */}
          <div className="relative h-64 w-full sm:h-80" style={{ backgroundColor: `${theme.royal}1A` }}>
            {active.primaryImage ? (
              <Image src={active.primaryImage} alt={active.primaryImageAlt || active.name} fill unoptimized className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm uppercase tracking-[0.3em]" style={{ color: `${theme.royal}99` }}>
                {active.code}
              </div>
            )}

            {rooms.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => (current === 0 ? rooms.length - 1 : current - 1))}
                  aria-label="Previous room"
                  className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-lg font-semibold transition hover:opacity-80"
                  style={{ backgroundColor: `${theme.sand}E6`, color: theme.navy }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndex((current) => (current === rooms.length - 1 ? 0 : current + 1))}
                  aria-label="Next room"
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-lg font-semibold transition hover:opacity-80"
                  style={{ backgroundColor: `${theme.sand}E6`, color: theme.navy }}
                >
                  ›
                </button>
              </>
            ) : null}

            <div className="absolute inset-x-0 bottom-0 p-6" style={{ background: `linear-gradient(to top, ${theme.navy}F2, transparent)` }}>
              <h4 className="font-serif text-2xl" style={{ color: theme.sand }}>{active.name}</h4>
              <p className="mt-1 text-sm" style={{ color: `${theme.sand}CC` }}>Up to {active.maxGuests} guests</p>
            </div>
          </div>

          {/* details + CTA */}
          <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {active.description ? (
                <p className="max-w-lg text-sm" style={{ color: `${theme.ink}99` }}>{active.description}</p>
              ) : null}
              <p className="mt-2 text-lg font-semibold" style={{ color: theme.royal }}>
                {peso(active.nightlyRate)} <span className="text-sm font-normal" style={{ color: `${theme.ink}80` }}>/ night</span>
              </p>
            </div>
            <Link
              href="/reservation"
              onClick={onClose}
              className="inline-block whitespace-nowrap rounded-full px-6 py-3 text-center text-sm font-semibold transition hover:opacity-90"
              style={{ backgroundColor: theme.sunset, color: theme.navy }}
            >
              Book this room
            </Link>
          </div>

          {/* thumbnail strip */}
          <div className="border-t px-6 py-5" style={{ borderColor: `${theme.ink}1A` }}>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {rooms.map((room, index) => (
                <button
                  key={room._id}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className="overflow-hidden rounded-xl text-left transition"
                  style={{
                    border: `${index === activeIndex ? 2 : 1}px solid ${index === activeIndex ? theme.sunset : `${theme.ink}1A`}`,
                  }}
                >
                  <div className="relative h-16 w-full" style={{ backgroundColor: `${theme.royal}1A` }}>
                    {room.primaryImage ? (
                      <Image src={room.primaryImage} alt={room.primaryImageAlt || room.name} fill unoptimized className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest" style={{ color: `${theme.royal}99` }}>
                        {room.code}
                      </div>
                    )}
                  </div>
                  <p className="truncate px-2 py-1 text-[11px] font-medium" style={{ color: theme.ink, backgroundColor: '#ffffff' }}>
                    {room.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}