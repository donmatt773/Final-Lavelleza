import ReservationForm from '@/app/components/ReservationForm';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';

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
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <header className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">La Velleza Resort</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Public Reservation Request</h1>
          <p className="mt-2 text-sm text-slate-400">
            Submit your preferred stay details. No account or login is required for this request form.
          </p>
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
