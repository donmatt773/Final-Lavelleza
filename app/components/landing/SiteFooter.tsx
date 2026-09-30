import Image from 'next/image';
import Link from 'next/link';
import logo from '@/app/icons/logo.jpg';
import { theme } from '@/app/lib/landingTheme';

export default function SiteFooter({
  checkInTime,
  checkOutTime,
}: {
  checkInTime: string;
  checkOutTime: string;
}) {
  return (
    <footer className="px-6 pb-6 pt-14 sm:pt-16" style={{ background: `linear-gradient(135deg, ${theme.navy}, ${theme.royal} 58%, ${theme.navy})`, color: theme.sand }}>
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
              <Link href="/#rooms" className="transition hover:text-white" style={{ color: `${theme.sand}CC` }}>Rooms &amp; stays</Link>
              <Link href="/#promos" className="transition hover:text-white" style={{ color: `${theme.sand}CC` }}>Package promos</Link>
              <Link href="/reservation" className="transition hover:text-white" style={{ color: `${theme.sand}CC` }}>Make a reservation</Link>
            </nav>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: theme.gold }}>Guest details</h2>
            <div className="mt-4 space-y-3 text-sm" style={{ color: `${theme.sand}CC` }}>
              <p>Check-in<br /><span style={{ color: theme.sand }}>{checkInTime}</span></p>
              <p>Check-out<br /><span style={{ color: theme.sand }}>{checkOutTime}</span></p>
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
  );
}