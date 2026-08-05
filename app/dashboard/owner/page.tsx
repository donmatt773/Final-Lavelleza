import ReservationDashboardPanel from '@/app/components/ReservationDashboardPanel';

export default function OwnerDashboard() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <header className="border-b border-slate-800 pb-5 mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-emerald-400">Owner Core Terminal</h1>
            <p className="text-slate-400 text-sm mt-1">La Velleza Resort • Full Operational System Access Control</p>
          </div>
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-xs font-mono">
            Role: 0 (System Administrator)
          </span>
        </header>

        <ReservationDashboardPanel />
      </div>
    </div>
  );
}