type Props = {
  reservationNumber: string;
  guestName: string;
  onCreateAnother: () => void;
};

export default function ReservationSuccess({ reservationNumber, guestName, onCreateAnother }: Props) {
  return (
    <section className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-emerald-100 shadow-2xl shadow-black/20">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">Reservation Request Submitted</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Thank you, {guestName}.</h2>
      <p className="mt-3 text-sm text-emerald-100/90">
        Your reservation request has been recorded and is now pending review by the resort team.
      </p>

      <div className="mt-5 rounded-xl border border-emerald-300/30 bg-slate-900/70 p-4">
        <p className="text-xs uppercase tracking-wider text-emerald-300">Reservation Number</p>
        <p className="mt-1 text-lg font-semibold text-white">{reservationNumber}</p>
      </div>

      <p className="mt-4 text-xs text-emerald-100/80">
        Please keep this number for follow-up. Staff will contact you using your provided email or mobile number.
      </p>

      <button
        type="button"
        onClick={onCreateAnother}
        className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
      >
        Submit Another Request
      </button>
    </section>
  );
}
