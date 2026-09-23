import Link from 'next/link';
import Image from 'next/image';
import ReservationForm from '@/app/components/ReservationForm';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';
import { theme } from '@/app/lib/landingTheme';
import logo from '@/app/icons/logo.jpg';

type RoomOption = {
  _id: string;
  name: string;
  code: string;
};

type ReservationSearchParams = Record<string, string | string[] | undefined>;

async function loadPublicReservationFormData() {
  try {
    await connectDB();

    const roomsRaw = await Room.find({ isArchived: false, status: 'AVAILABLE' })
      .select('name code')
      .sort({ name: 1 })
      .lean();

    const rooms: RoomOption[] = roomsRaw.map((room) => ({
      _id: String(room._id),
      name: String(room.name || ''),
      code: String(room.code || ''),
    }));

    return { rooms };
  } catch {
    return { rooms: [] as RoomOption[] };
  }
}

export default async function ReservationPage({ searchParams }: { searchParams: Promise<ReservationSearchParams> }) {
  const { rooms } = await loadPublicReservationFormData();
  const query = await searchParams;
  const readParam = (value: string | string[] | undefined) => typeof value === 'string' ? value : '';

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 sm:py-10" style={{ backgroundColor: theme.sand, color: theme.ink }}>
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 overflow-hidden rounded-3xl border shadow-xl" style={{ borderColor: `${theme.navy}33`, background: `linear-gradient(135deg, ${theme.navy}, ${theme.royal} 58%, ${theme.navy})`, boxShadow: `0 20px 50px ${theme.navy}26` }}>
          <div className="flex flex-col gap-5 border-b p-5 sm:flex-row sm:items-start sm:justify-between sm:p-7" style={{ borderColor: `${theme.sand}26` }}>
            <div>
              <div className="mb-4 flex items-center gap-3">
                <Image src={logo} alt="La Velleza Resort" className="h-9 w-9 rounded-full object-cover" priority />
                <span className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: `${theme.sand}B8` }}>La Velleza Resort</span>
              </div>
              <h1 className="font-serif text-3xl tracking-tight sm:text-4xl" style={{ color: theme.sand }}>Plan your stay</h1>
              <p className="mt-3 max-w-xl text-sm leading-6" style={{ color: `${theme.sand}B8` }}>
                Submit your preferred dates and guest details. No account or login is required for this request.
              </p>
            </div>
            <Link href="/" className="text-sm font-medium transition hover:text-white" style={{ color: `${theme.sand}B8` }}>Back to resort</Link>
          </div>
          <div className="grid gap-3 p-5 text-xs sm:grid-cols-3 sm:p-7" style={{ backgroundColor: `${theme.ink}26`, color: `${theme.sand}99` }}>
            <div><span className="block font-semibold" style={{ color: theme.sand }}>01 · Choose</span> Select a room and dates.</div>
            <div><span className="block font-semibold" style={{ color: theme.sand }}>02 · Customize</span> Add a package or extras.</div>
            <div><span className="block font-semibold" style={{ color: theme.sand }}>03 · Request</span> Our team confirms availability.</div>
          </div>
        </header>

        <ReservationForm
          rooms={rooms}
          initialSelection={{
            room: readParam(query.room),
            promo: readParam(query.promo),
            checkIn: readParam(query.checkIn),
            checkOut: readParam(query.checkOut),
          }}
        />
      </div>
    </main>
  );
}
