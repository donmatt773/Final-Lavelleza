import ReservationDashboardPanel from '@/app/components/ReservationDashboardPanel';

export default function StaffDashboard() {
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <header className="border-b border-slate-800 pb-5 mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-emerald-400">Front Desk Workspace</h1>
            <p className="text-slate-400 text-sm mt-1">La Velleza Resort • Daily Guest Manifest &amp; Booking Desk</p>
          </div>
          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full text-xs font-mono">
            Role: 1 (Front Desk Staff)
          </span>
        </header>

        <ReservationDashboardPanel />
      </div>
    </div>
  );
}