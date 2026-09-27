import { theme } from '@/app/lib/landingTheme';

type Props = {
  reservationNumber: string;
  guestName: string;
  onCreateAnother: () => void;
};

export default function ReservationSuccess({ reservationNumber, guestName, onCreateAnother }: Props) {
  return (
    <section
      className="rounded-3xl border p-6 shadow-xl"
      style={{
        borderColor: `${theme.sunset}55`,
        backgroundColor: '#FFFDF8',
        color: theme.ink,
        boxShadow: `0 20px 50px ${theme.ink}12`,
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: theme.coral }}>Reservation Request Submitted</p>
      <h2 className="mt-2 text-2xl font-semibold" style={{ color: theme.navy }}>Thank you, {guestName}.</h2>
      <p className="mt-3 text-sm" style={{ color: `${theme.ink}CC` }}>
        Your reservation request has been recorded and is now pending review by the resort team.
      </p>

      <div className="mt-5 rounded-xl border p-4" style={{ borderColor: `${theme.sand}33`, backgroundColor: theme.navy }}>
        <p className="text-xs uppercase tracking-wider" style={{ color: theme.gold }}>Reservation Number</p>
        <p className="mt-1 text-lg font-semibold" style={{ color: theme.sand }}>{reservationNumber}</p>
      </div>

      <p className="mt-4 text-xs" style={{ color: `${theme.ink}B3` }}>
        Please keep this number for follow-up. Staff will contact you using your provided email or mobile number.
      </p>

      <button
        type="button"
        onClick={onCreateAnother}
        className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-90"
        style={{ backgroundColor: theme.sunset, color: theme.navy }}
      >
        Submit Another Request
      </button>
    </section>
  );
}
