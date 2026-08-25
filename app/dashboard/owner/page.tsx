import Link from 'next/link';
import Image from 'next/image';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';
import Promo from '@/app/lib/Promo';
import RateSettings from '@/app/lib/RateSettings';
import DayNightDivider from '@/app/components/landing/DayNightDivider';
import SiteNav from '@/app/components/landing/SiteNav';
import RoomsShowcase from '@/app/components/landing/RoomsShowcase';
import { theme } from '@/app/lib/landingTheme';
import { peso } from '@/app/lib/landingFormat';
import type { FeaturedRoom, FeaturedPromo } from '@/app/lib/landingTypes';

export const revalidate = 300; // refresh featured content every 5 minutes

async function loadLandingData() {
  try {
    await connectDB();

    const now = new Date();

    const [roomsRaw, promosRaw, rateSettingsRaw] = await Promise.all([
      Room.find({ isArchived: false, status: 'AVAILABLE' })
        .select('name code description maxGuests nightlyRate halfDayRate wholeDayRate images beds features amenities')
        .populate('beds.bedTypeId', 'name')
        .populate('features', 'name')
        .populate('amenities', 'name')
        .sort({ nightlyRate: -1 })
        .limit(60) // all rooms for a resort this size; RoomsShowcase paginates client-side
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
      const beds = Array.isArray(room.beds)
        ? room.beds
            .map((bed) => ({
              name: (bed.bedTypeId as unknown as { name?: string } | null)?.name || 'Bed',
              quantity: Number(bed.quantity || 1),
            }))
            .filter((bed) => bed.name)
        : [];
      const features = Array.isArray(room.features)
        ? room.features.map((feature) => (feature as unknown as { name?: string })?.name || '').filter(Boolean)
        : [];
      const amenities = Array.isArray(room.amenities)
        ? room.amenities.map((amenity) => (amenity as unknown as { name?: string })?.name || '').filter(Boolean)
        : [];

      return {
        _id: String(room._id),
        name: String(room.name || ''),
        code: String(room.code || ''),
        description: room.description || '',
        maxGuests: Number(room.maxGuests || 0),
        nightlyRate: Number(room.nightlyRate || 0),
        halfDayRate: Number(room.halfDayRate || 0),
        wholeDayRate: Number(room.wholeDayRate || 0),
        primaryImage: primary?.fileUrl,
        primaryImageAlt: primary?.altText || room.name,
        images: images.map((image) => ({ fileUrl: image.fileUrl, altText: image.altText })),
        beds,
        features,
        amenities,
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

export default async function Home() {
  const { rooms, promos, rateSettings } = await loadLandingData();

  return (
    <main style={{ backgroundColor: theme.sand, color: theme.ink }} className="font-sans">
      <SiteNav />

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ backgroundColor: theme.navy }}>
        {/* horizon texture */}
        <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full opacity-30" viewBox="0 0 1200 160" preserveAspectRatio="none">
          <path d="M0,120 C200,60 400,150 600,90 C800,40 1000,130 1200,80 L1200,160 L0,160 Z" fill={theme.royal} />
        </svg>
        <div className="pointer-events-none absolute right-16 top-16 h-24 w-24 rounded-full opacity-60 blur-sm" style={{ backgroundColor: theme.sunset }} />
        <div className="pointer-events-none absolute right-24 top-20 h-14 w-14 rounded-full opacity-70 blur-[2px]" style={{ backgroundColor: theme.gold }} />

        <div className="relative mx-auto max-w-5xl px-6 py-28 text-center sm:py-36">
          <p className="text-xs font-semibold uppercase tracking-[0.4em]" style={{ color: theme.gold }}>
            La Velleza Events Place &amp; Hidden Resort
          </p>
          <h1 className="mt-5 font-serif text-4xl leading-tight sm:text-6xl" style={{ color: theme.sand }}>
            Sunset views, ocean breeze,<br className="hidden sm:block" /> built for slow mornings.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base sm:text-lg" style={{ color: `${theme.sand}CC` }}>
            Pool days, family reunions, and overnight stays — book directly, no middlemen,
            and hear back from our team the same day.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/reservation"
              className="rounded-full px-7 py-3 text-sm font-semibold transition hover:opacity-90"
              style={{ backgroundColor: theme.sunset, color: theme.navy }}
            >
              Check availability
            </Link>
            <a
              href="#rooms"
              className="rounded-full border px-7 py-3 text-sm font-semibold transition hover:bg-white/5"
              style={{ borderColor: `${theme.sand}66`, color: theme.sand }}
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

      {/* ROOMS (paginated grid + full gallery modal, both client-side) */}
      <RoomsShowcase rooms={rooms} />

      {/* PROMOS */}
      {promos.length > 0 ? (
        <section id="promos" className="py-20" style={{ backgroundColor: `${theme.royal}0D` }}>
          <div className="mx-auto max-w-6xl px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.coral }}>
              Package Promos
            </p>
            <h2 className="mt-2 font-serif text-3xl" style={{ color: theme.caramel }}>
              Bring the whole barkada
            </h2>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {promos.map((promo) => (
                <div key={promo._id} className="overflow-hidden rounded-2xl border" style={{ borderColor: `${theme.ink}1A`, backgroundColor: theme.sand }}>
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
                      <p className="mt-2 text-sm" style={{ color: `${theme.ink}99` }}>{promo.description}</p>
                    ) : null}
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm font-semibold" style={{ color: theme.coral }}>{peso(promo.packagePrice)}</span>
                      {promo.includedPax ? (
                        <span className="text-xs" style={{ color: `${theme.ink}99` }}>Good for {promo.includedPax} pax</span>
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
        <h2 className="font-serif text-3xl" style={{ color: theme.caramel }}>Ready when you are.</h2>
        <p className="mx-auto mt-3 max-w-md text-sm" style={{ color: `${theme.ink}99` }}>
          Submit a reservation request — no account needed. Our staff confirms availability and follows up by email or phone.
        </p>
        <Link
          href="/reservation"
          className="mt-8 inline-block rounded-full px-8 py-3 text-sm font-semibold transition hover:opacity-90"
          style={{ backgroundColor: theme.navy, color: theme.sand }}
        >
          Start a reservation
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="border-t px-6 py-10 text-center text-xs" style={{ borderColor: `${theme.ink}1A`, color: `${theme.ink}99` }}>
        <p>La Velleza Events Place &amp; Hidden Resort · Check-in {rateSettings.checkInTime} · Check-out {rateSettings.checkOutTime}</p>
        <p className="mt-2">
          <Link href="/login" className="underline underline-offset-4">Staff &amp; owner login</Link>
        </p>
      </footer>
    </main>
  );
}