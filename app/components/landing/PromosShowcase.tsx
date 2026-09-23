'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { theme } from '@/app/lib/landingTheme';
import { peso } from '@/app/lib/landingFormat';
import type { FeaturedPromo } from '@/app/lib/landingTypes';

const PAGE_SIZE = 4;

type Props = {
  promos: FeaturedPromo[];
};

type PromoDetailModalProps = {
  promo: FeaturedPromo | null;
  open: boolean;
  onClose: () => void;
};

function PromoDetailModal({ promo, open, onClose }: PromoDetailModalProps) {
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

  if (!open || !promo) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4"
      style={{ backgroundColor: `${theme.navy}E6` }}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
        style={{ backgroundColor: theme.sand }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative h-56 w-full shrink-0 sm:h-72" style={{ backgroundColor: `${theme.sunset}1F` }}>
          {promo.bannerUrl ? (
            <Image src={promo.bannerUrl} alt={promo.bannerAlt || promo.name} fill unoptimized className="object-contain p-4" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm uppercase tracking-[0.3em]" style={{ color: `${theme.ink}99` }}>
              {promo.code}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close promo details"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-lg font-semibold transition hover:opacity-80"
            style={{ backgroundColor: `${theme.sand}E6`, color: theme.navy }}
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.coral }}>Package promo</p>
          <h3 className="mt-2 font-serif text-3xl" style={{ color: theme.caramel }}>{promo.name}</h3>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>{promo.code}</p>
          {promo.description ? (
            <p className="mt-5 text-sm leading-relaxed" style={{ color: `${theme.ink}CC` }}>{promo.description}</p>
          ) : null}

          <div className="mt-6 grid gap-4 rounded-2xl border p-4 sm:grid-cols-2" style={{ borderColor: `${theme.ink}1A` }}>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>Package price</p>
              <p className="mt-1 text-xl font-semibold" style={{ color: theme.coral }}>{peso(promo.packagePrice)}</p>
            </div>
            {promo.includedPax ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em]" style={{ color: `${theme.ink}80` }}>Good for</p>
                <p className="mt-1 text-xl font-semibold" style={{ color: theme.royal }}>{promo.includedPax} guests</p>
              </div>
            ) : null}
          </div>

          <Link
            href={(() => {
              const params = new URLSearchParams({ promo: promo._id });
              const roomId = promo.includedRoomIds?.[0];
              if (roomId) params.set('room', roomId);
              if (promo.startDate) params.set('checkIn', promo.startDate);
              if (promo.endDate) params.set('checkOut', promo.endDate);
              return `/reservation?${params.toString()}`;
            })()}
            onClick={onClose}
            className="mt-6 block w-full rounded-full px-6 py-3 text-center text-sm font-semibold transition hover:opacity-90"
            style={{ backgroundColor: theme.sunset, color: theme.navy }}
          >
            Book {promo.name}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PromosShowcase({ promos }: Props) {
  const [page, setPage] = useState(1);
  const [selectedPromo, setSelectedPromo] = useState<FeaturedPromo | null>(null);

  const totalPages = Math.max(1, Math.ceil(promos.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedPromos = promos.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section id="promos" className="py-20" style={{ backgroundColor: `${theme.royal}0D` }}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.coral }}>Package Promos</p>
            <h2 className="mt-2 font-serif text-3xl" style={{ color: theme.caramel }}>Bring the whole barkada</h2>
          </div>
          <p className="text-sm" style={{ color: `${theme.ink}99` }}>Tap a package to see the details.</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {pagedPromos.map((promo) => (
            <button
              key={promo._id}
              type="button"
              onClick={() => setSelectedPromo(promo)}
              className="overflow-hidden rounded-2xl border text-left transition hover:-translate-y-1 hover:shadow-lg"
              style={{ borderColor: `${theme.ink}1A`, backgroundColor: theme.sand }}
            >
              <div className="relative h-48 w-full" style={{ backgroundColor: `${theme.sunset}1F` }}>
                {promo.bannerUrl ? (
                  <Image src={promo.bannerUrl} alt={promo.bannerAlt || promo.name} fill unoptimized className="object-contain p-4" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.3em]" style={{ color: `${theme.ink}99` }}>
                    {promo.code}
                  </div>
                )}
              </div>
              <div className="p-5">
                <h3 className="font-serif text-lg" style={{ color: theme.caramel }}>{promo.name}</h3>
                {promo.description ? (
                  <p className="mt-2 line-clamp-2 text-sm" style={{ color: `${theme.ink}99` }}>{promo.description}</p>
                ) : null}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: theme.coral }}>{peso(promo.packagePrice)}</span>
                  {promo.includedPax ? (
                    <span className="text-xs" style={{ color: `${theme.ink}99` }}>Good for {promo.includedPax}</span>
                  ) : null}
                </div>
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
            <span className="text-sm" style={{ color: `${theme.ink}99` }}>Page {safePage} of {totalPages}</span>
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
      </div>

      <PromoDetailModal promo={selectedPromo} open={selectedPromo !== null} onClose={() => setSelectedPromo(null)} />
    </section>
  );
}
