import ReservationDashboardPanel from '@/app/components/ReservationDashboardPanel';

export default function OwnerOverviewPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-slate-300">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">Owner Overview</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Operations Dashboard</h1>
          </div>
          <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            Live system
          </div>
        </div>
      </div>

      <ReservationDashboardPanel />

      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-slate-300">
        <h2 className="text-xl font-semibold text-white">Quick status</h2>
        <p className="mt-2 text-sm text-slate-400">
          This overview is intentionally separate from the public landing page. Use the sidebar tabs to manage users, rooms, promos, reservations, payment reports, and rate settings.
        </p>
      </div>
    </div>
  );
}