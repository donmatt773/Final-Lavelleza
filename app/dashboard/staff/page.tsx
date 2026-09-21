'use client';

import { useState } from 'react';
import ReservationDashboardPanel from '@/app/components/ReservationDashboardPanel';
import ReservationManagementPanel from '@/app/components/ReservationManagementPanel';
import PaymentReportsPanel from '@/app/components/PaymentReportsPanel';

type StaffTab = 'overview' | 'reservations' | 'reports';

export default function StaffDashboard() {
  const [activeTab, setActiveTab] = useState<StaffTab>('overview');

  return (
    <div className="min-h-screen bg-slate-900 p-8 text-white">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-emerald-400">Front Desk Workspace</h1>
            <p className="text-slate-400 text-sm mt-1">La Velleza Resort • Daily Guest Manifest &amp; Booking Desk</p>
          </div>
          <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-full text-xs font-mono">
            Role: 1 (Front Desk Staff)
          </span>
        </header>

        <nav className="mb-6 flex flex-wrap gap-2" aria-label="Staff dashboard tabs">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'overview' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reservations')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'reservations' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            Reservations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('reports')}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${activeTab === 'reports' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}
          >
            Payment Reports
          </button>
        </nav>

        {activeTab === 'overview' ? <ReservationDashboardPanel /> : activeTab === 'reservations' ? <ReservationManagementPanel active={true} /> : <PaymentReportsPanel active={true} />}
      </div>
    </div>
  );
}