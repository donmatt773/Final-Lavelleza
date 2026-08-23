import Link from 'next/link';
import Image from 'next/image';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';
import Promo from '@/app/lib/Promo';
import RateSettings from '@/app/lib/RateSettings';
import DayNightDivider from '@/app/components/landing/DayNightDivider';

export const revalidate = 300; // refresh featured content every 5 minutes

type FeaturedRoom = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  maxGuests: number;
  nightlyRate: number;
  primaryImage?: string;
  primaryImageAlt?: string;
};

type FeaturedPromo = {
  _id: string;
  name: string;
  code: string;
  description?: string;
  packagePrice: number;
  includedPax?: number;
  bannerUrl?: string;
  bannerAlt?: string;
};

async function loadLandingData() {
  try {
    await connectDB();

    const now = new Date();

    const [roomsRaw, promosRaw, rateSettingsRaw] = await Promise.all([
      Room.find({ isArchived: false, status: 'AVAILABLE' })
        .select('name code description maxGuests nightlyRate images')
        .sort({ nightlyRate: -1 })
        .limit(4)
        .lean(),
      Promo.find({
        isArchived: false,
        status: 'ACTIVE',
        $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }],
      })
        .select('name code description packagePrice includedPax banner')
        .sort({ createdAt: -1 })
        .limit(3)
        .lean(),
      RateSettings.findOne({ key: 'default' })
        .select('checkInTime checkOutTime halfDayCutoffTime')
        .lean(),
    ]);

    const rooms: FeaturedRoom[] = roomsRaw.map((room) => {
      const images = Array.isArray(room.images) ? room.images : [];
      const primary = images.find((image) => image.isPrimary) || images[0];
      return {
        _id: String(room._id),
        name: String(room.name || ''),
        code: String(room.code || ''),
        description: room.description || '',
        maxGuests: Number(room.maxGuests || 0),
        nightlyRate: Number(room.nightlyRate || 0),
        primaryImage: primary?.fileUrl,
        primaryImageAlt: primary?.altText || room.name,
      };
    });

    const promos: FeaturedPromo[] = promosRaw.map((promo) => ({
      _id: String(promo._id),
      name: String(promo.name || ''),
      code: String(promo.code || ''),
      description: promo.description || '',
      packagePrice: Number(promo.packagePrice || 0),
      includedPax: promo.includedPax,
      bannerUrl: promo.banner?.fileUrl,
      bannerAlt: promo.banner?.altText || promo.name,
    }));

    return {
      rooms,
      promos,
      rateSettings: {
        checkInTime: rateSettingsRaw?.checkInTime || '1:00 PM',
        checkOutTime: rateSettingsRaw?.checkOutTime || '11:00 AM',
        halfDayCutoffTime: rateSettingsRaw?.halfDayCutoffTime || '6:00 PM',
      },
    };
  } catch {
    return {
      rooms: [] as FeaturedRoom[],
      promos: [] as FeaturedPromo[],
      rateSettings: { checkInTime: '1:00 PM', checkOutTime: '11:00 AM', halfDayCutoffTime: '6:00 PM' },
    };
  }
}

const peso = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(value || 0);

export default async function Home() {
  const { rooms, promos, rateSettings } = await loadLandingData();

  return (
    <main style={{ backgroundColor: '#F3E9D4', color: '#16342A' }} className="font-sans">
      {/* HERO */}
      <section className="relative overflow-hidden" style={{ backgroundColor: '#16342A' }}>
        {/* horizon texture */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-40" viewBox="0 0 1200 160" preserveAspectRatio="none">
          <path d="M0,120 C200,60 400,150 600,90 C800,40 1000,130 1200,80 L1200,160 L0,160 Z" fill="#0F251C" />
        </svg>
        <div className="pointer-events-none absolute right-16 top-16 h-24 w-24 rounded-full opacity-70 blur-sm" style={{ backgroundColor: '#E3A23C' }} />

        <div className="relative mx-auto max-w-5xl px-6 py-28 text-center sm:py-36">
          <p className="text-xs font-semibold uppercase tracking-[0.4em]" style={{ color: '#E3A23C' }}>
            La Velleza Resort
          </p>
          <h1 className="mt-5 font-serif text-4xl leading-tight sm:text-6xl" style={{ color: '#F3E9D4' }}>
            A quiet stretch of green,<br className="hidden sm:block" /> built for slow mornings.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg" style={{ color: '#F3E9D4CC' }}>
            Pool days, family reunions, and overnight stays — book directly, no middlemen,
            and hear back from our team the same day.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/reservation"
              className="rounded-full px-7 py-3 text-sm font-semibold transition hover:opacity-90"
              style={{ backgroundColor: '#E3A23C', color: '#16342A' }}
            >
              Check availability
            </Link>
            <a
              href="#rooms"
              className="rounded-full border px-7 py-3 text-sm font-semibold transition hover:bg-white/5"
              style={{ borderColor: '#F3E9D466', color: '#F3E9D4' }}
            >
              See rooms
            </a>
          </div>
        </div>
      </section>

      {/* SIGNATURE: DAY / NIGHT DIVIDER */}
      <DayNightDivider
        checkInTime={rateSettings.checkInTime}
        checkOutTime={rateSettings.checkOutTime}
        halfDayCutoffTime={rateSettings.halfDayCutoffTime}
      />

      {/* ROOMS */}
      <section id="rooms" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#2F7A79' }}>
              Rooms &amp; Houses
            </p>
            <h2 className="mt-2 font-serif text-3xl" style={{ color: '#16342A' }}>
              Where you'll actually sleep
            </h2>
          </div>
          <Link href="/reservation" className="text-sm font-semibold underline underline-offset-4" style={{ color: '#2F7A79' }}>
            View all &amp; book →
          </Link>
        </div>

        {rooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center text-sm" style={{ borderColor: '#16342A33', color: '#16342A99' }}>
            Rooms will appear here once they're published from the admin dashboard.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {rooms.map((room) => (
              <div key={room._id} className="overflow-hidden rounded-2xl border" style={{ borderColor: '#16342A1A', backgroundColor: '#ffffff' }}>
                <div className="relative h-40 w-full" style={{ backgroundColor: '#2F7A791A' }}>
                  {room.primaryImage ? (
                    <Image src={room.primaryImage} alt={room.primaryImageAlt || room.name} fill unoptimized className="object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.3em]" style={{ color: '#2F7A7999' }}>
                      {room.code}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-serif text-lg" style={{ color: '#16342A' }}>{room.name}</h3>
                  <p className="mt-1 text-xs" style={{ color: '#16342A99' }}>Up to {room.maxGuests} guests</p>
                  <p className="mt-3 text-sm font-semibold" style={{ color: '#2F7A79' }}>{peso(room.nightlyRate)} / night</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* PROMOS */}
      {promos.length > 0 ? (
        <section className="py-20" style={{ backgroundColor: '#16342A0D' }}>
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: '#E2694B' }}>
              Package Promos
            </p>
            <h2 className="mt-2 font-serif text-3xl" style={{ color: '#16342A' }}>
              Bring the whole barkada
            </h2>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {promos.map((promo) => (
                <div key={promo._id} className="overflow-hidden rounded-2xl border" style={{ borderColor: '#16342A1A', backgroundColor: '#F3E9D4' }}>
                  <div className="relative h-36 w-full" style={{ backgroundColor: '#E3A23C33' }}>
                    {promo.bannerUrl ? (
                      <Image src={promo.bannerUrl} alt={promo.bannerAlt || promo.name} fill unoptimized className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs uppercase tracking-[0.3em]" style={{ color: '#16342A99' }}>
                        {promo.code}
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="font-serif text-lg" style={{ color: '#16342A' }}>{promo.name}</h3>
                    {promo.description ? (
                      <p className="mt-2 text-sm" style={{ color: '#16342A99' }}>{promo.description}</p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: '#E2694B' }}>{peso(promo.packagePrice)}</span>
                      {promo.includedPax ? (
                        <span className="text-xs" style={{ color: '#16342A99' }}>Good for {promo.includedPax} pax</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* CTA STRIP */}
      <section className="px-6 py-20 text-center">
        <h2 className="font-serif text-3xl" style={{ color: '#16342A' }}>Ready when you are.</h2>
        <p className="mx-auto mt-3 max-w-md text-sm" style={{ color: '#16342A99' }}>
          Submit a reservation request — no account needed. Our staff confirms availability and follows up by email or phone.
        </p>
        <Link
          href="/reservation"
          className="mt-8 inline-block rounded-full px-8 py-3 text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: '#16342A', color: '#F3E9D4' }}
        >
          Start a reservation
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="border-t px-6 py-10 text-center text-xs" style={{ borderColor: '#16342A1A', color: '#16342A99' }}>
        <p>La Velleza Resort · Check-in {rateSettings.checkInTime} · Check-out {rateSettings.checkOutTime}</p>
        <p className="mt-2">
          <Link href="/login" className="underline underline-offset-4">Staff &amp; owner login</Link>
        </p>
      </footer>
    </main>
  );
}
