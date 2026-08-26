'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { theme } from '@/app/lib/landingTheme';
import { peso } from '@/app/lib/landingFormat';
import type { FeaturedRoom } from '@/app/lib/landingTypes';
import AllRoomsModal from '@/app/components/landing/AllRoomsModal';
import RoomDetailModal from '@/app/components/landing/RoomdetailModal';

const PAGE_SIZE = 4;

type Props = {
  rooms: FeaturedRoom[];
};

export default function RoomsShowcase({ rooms }: Props) {
  const [page, setPage] = useState(1);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<FeaturedRoom | null>(null);

  const totalPages = Math.max(1, Math.ceil(rooms.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const pagedRooms = rooms.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section id="rooms" className="mx-auto max-w-6xl px-6 py-20">
      <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.royal }}>
            Rooms &amp; Houses
          </p>
          <h2 className="mt-2 font-serif text-3xl" style={{ color: theme.caramel }}>
            Where you'll actually sleep
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setGalleryOpen(true)}
          disabled={rooms.length === 0}
          className="text-sm font-semibold underline underline-offset-4 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: theme.royal }}
        >
          View all &amp; book →
        </button>
      </div>

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm" style={{ borderColor: `${theme.ink}33`, color: `${theme.ink}99` }}>
          Rooms will appear here once they're published from the admin dashboard.
        </div>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {pagedRooms.map((room) => (
              <button
                key={room._id}
                type="button"
                onClick={() => setSelectedRoom(room)}
                className="overflow-hidden rounded-2xl border text-left transition hover:-translate-y-1 hover:shadow-lg"
                style={{ borderColor: `${theme.ink}1A`, backgroundColor: '#ffffff' }}
              >
                <div className="relative h-40 w-full" style={{ backgroundColor: `${theme.royal}1A` }}>
                  {room.primaryImage ? (
                    <Image src={room.primaryImage} alt={room.primaryImageAlt || room.name} fill unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.3em]" style={{ color: `${theme.royal}99` }}>
                      {room.code}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-serif text-lg" style={{ color: theme.caramel }}>{room.name}</h3>
                  <p className="mt-1 text-xs" style={{ color: `${theme.ink}99` }}>Up to {room.maxGuests} guests</p>
                  <p className="mt-3 text-sm font-semibold" style={{ color: theme.royal }}>{peso(room.nightlyRate)} / night</p>
                </div>
              </button>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
                className="rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: `${theme.ink}33`, color: theme.ink }}
              >
                Previous
              </button>
              <span className="text-sm" style={{ color: `${theme.ink}99` }}>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
                className="rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: `${theme.ink}33`, color: theme.ink }}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}

      <AllRoomsModal open={galleryOpen} onClose={() => setGalleryOpen(false)} rooms={rooms} />
      <RoomDetailModal room={selectedRoom} open={selectedRoom !== null} onClose={() => setSelectedRoom(null)} />
    </section>
  );
}