import Link from 'next/link';
import Image from 'next/image';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';
import Promo from '@/app/lib/Promo';
import RateSettings from '@/app/lib/RateSettings';
import DayNightDivider from '@/app/components/landing/DayNightDivider';
import SiteNav from '@/app/components/landing/SiteNav';
import RoomsShowcase from '@/app/components/landing/RoomsShowcase';
import RealtimeLandingRefresh from '@/components/RealtimeLandingRefresh';
import { theme } from '@/app/lib/landingTheme';
import { peso } from '@/app/lib/landingFormat';
import type { FeaturedRoom, FeaturedPromo } from '@/app/lib/landingTypes';
import logo from '@/app/icons/logo.jpg';

export const dynamic = 'force-dynamic';

async function loadLandingData() {
  try {
    await connectDB();

    const now = new Date();

    const [roomsRaw, promosRaw, rateSettingsRaw] = await Promise.all([
      Room.find({ isArchived: false, status: 'AVAILABLE' })
        .select('name code description maxGuests nightlyRate images')
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
  } catch (error) {
    console.error('LANDING DATA ERROR:', error);
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
      <RealtimeLandingRefresh />
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

      {/* LOCATION */}
      <section id="location" className="px-6 py-16 sm:py-20" style={{ backgroundColor: `${theme.royal}0D` }}>
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="order-2 overflow-hidden rounded-2xl border shadow-sm lg:order-1" style={{ borderColor: `${theme.ink}1A` }}>
            <iframe
              title="La Velleza Resort location on Google Maps"
              src="https://www.google.com/maps?q=7.9560259,123.5980586&z=17&output=embed"
              className="h-72 w-full sm:h-96"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <div className="order-1 lg:order-2">
            <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.coral }}>Find us</p>
            <h2 className="mt-3 font-serif text-4xl leading-tight" style={{ color: theme.caramel }}>Make your way to La Velleza.</h2>
            <p className="mt-4 max-w-md text-sm leading-6" style={{ color: `${theme.ink}99` }}>
              See the resort location, plan your route, and come ready for pool days, family gatherings, and slow mornings by the water.
            </p>
            <p className="mt-5 text-sm font-semibold" style={{ color: theme.royal }}>La Velleza Resort</p>
            <p className="mt-1 text-sm" style={{ color: `${theme.ink}99` }}>Zamboanga del Norte, Philippines</p>
            <a
              href="https://www.google.com/maps/place/La+velleza+resort/@7.9560259,123.5954783,17z/data=!3m1!4b1!4m6!3m5!1s0x325439007a07a1ad:0x73120fd54fab48de!8m2!3d7.9560259!4d123.5980586!16s%2Fg%2F11vpylgs11?entry=ttu&g_ep=EgoyMDI2MDkyMC4wIKXMDSoASAFQAw%3D%3D"
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-90"
              style={{ backgroundColor: theme.navy, color: theme.sand }}
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 pb-6 pt-14 sm:pt-16" style={{ backgroundColor: theme.navy, color: theme.sand }}>
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 border-b pb-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]" style={{ borderColor: `${theme.sand}26` }}>
            <div>
              <Link href="/" className="inline-flex items-center gap-3">
                <Image src={logo} alt="La Velleza Resort" className="h-10 w-10 rounded-full object-cover" />
                <span className="font-serif text-2xl">La Velleza</span>
              </Link>
              <p className="mt-5 max-w-xs text-sm leading-6" style={{ color: `${theme.sand}B8` }}>
                A place for slow mornings, meaningful gatherings, and easy stays by the water.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: theme.gold }}>Explore</h2>
              <nav className="mt-4 flex flex-col items-start gap-3 text-sm" aria-label="Footer navigation">
                <a href="#rooms" className="transition hover:text-white" style={{ color: `${theme.sand}CC` }}>Rooms &amp; stays</a>
                <a href="#promos" className="transition hover:text-white" style={{ color: `${theme.sand}CC` }}>Package promos</a>
                <Link href="/reservation" className="transition hover:text-white" style={{ color: `${theme.sand}CC` }}>Make a reservation</Link>
              </nav>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: theme.gold }}>Guest details</h2>
              <div className="mt-4 space-y-3 text-sm" style={{ color: `${theme.sand}CC` }}>
                <p>Check-in<br /><span style={{ color: theme.sand }}>{rateSettings.checkInTime}</span></p>
                <p>Check-out<br /><span style={{ color: theme.sand }}>{rateSettings.checkOutTime}</span></p>
                <p>Reservations are confirmed by our team after review.</p>
              </div>
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: theme.gold }}>Stay connected</h2>
              <p className="mt-4 text-sm leading-6" style={{ color: `${theme.sand}B8` }}>
                Ready to bring the whole barkada? Send a request and our team will follow up by email or phone.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between" style={{ color: `${theme.sand}80` }}>
            <p>&copy; {new Date().getFullYear()} La Velleza Events Place &amp; Hidden Resort. All rights reserved.</p>
            <p>Made for memorable days and restful nights.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}