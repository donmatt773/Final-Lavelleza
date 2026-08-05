'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import UserManagementPanel from '@/app/components/UserManagementPanel';
import RoomManagementPanel from '@/app/components/RoomManagementPanel';
import RoomRateSettingsPanel from '@/app/components/RoomRateSettingsPanel';
import PromoManagementPanel from '@/app/components/PromoManagementPanel';
import ReservationManagementPanel from '@/app/components/ReservationManagementPanel';
import PaymentReportsPanel from '@/app/components/PaymentReportsPanel';

type DashboardTab = 'overview' | 'users' | 'rooms' | 'promos' | 'reservations' | 'reports' | 'rate-settings';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<DashboardTab>('users');

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // ignore and fall back to the login screen
    }
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_name');
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      {/* Persistent System Control Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-6 shrink-0">
        <div className="space-y-8">
          {/* Logo Element */}
          <div className="flex items-center space-x-3 px-2">
            <div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center font-bold text-white text-sm">
              LV
            </div>
            <span className="font-bold text-white tracking-wide text-sm">La Velleza System</span>
          </div>

          {/* Navigation Links Group */}
          <nav className="space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-2">Main Menu</p>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`w-full text-left font-medium text-xs px-3 py-2.5 rounded-lg transition-all ${activeTab === 'overview' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              🎛️ Owner Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reservations')}
              className={`w-full text-left font-medium text-xs px-3 py-2.5 rounded-lg transition-all ${activeTab === 'reservations' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              📋 Reservation Management
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`w-full text-left font-medium text-xs px-3 py-2.5 rounded-lg transition-all ${activeTab === 'users' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              👤 User Management
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rooms')}
              className={`w-full text-left font-medium text-xs px-3 py-2.5 rounded-lg transition-all ${activeTab === 'rooms' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              🛏️ Room Management
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('promos')}
              className={`w-full text-left font-medium text-xs px-3 py-2.5 rounded-lg transition-all ${activeTab === 'promos' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              🎁 Promo Management
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('reports')}
              className={`w-full text-left font-medium text-xs px-3 py-2.5 rounded-lg transition-all ${activeTab === 'reports' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              📊 Payment Reports
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rate-settings')}
              className={`w-full text-left font-medium text-xs px-3 py-2.5 rounded-lg transition-all ${activeTab === 'rate-settings' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              ⚙️ Rate Settings
            </button>
          </nav>
        </div>

        {/* Action Controls Group */}
        <div className="pt-4 border-t border-slate-800/60">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 bg-slate-950 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 border border-slate-800/80 hover:border-rose-900/30 rounded-lg py-2.5 text-xs font-semibold transition-all shadow-inner"
          >
            <span>🛑 Terminate Session</span>
          </button>
        </div>
      </aside>

      {/* Main Core Component Viewport Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          {pathname?.includes('/dashboard/owner') ? (
            <div className="mt-2">
              {activeTab === 'users' ? <UserManagementPanel active={true} /> : activeTab === 'rooms' ? <RoomManagementPanel active={true} /> : activeTab === 'promos' ? <PromoManagementPanel active={true} /> : activeTab === 'reservations' ? <ReservationManagementPanel active={true} /> : activeTab === 'reports' ? <PaymentReportsPanel active={true} /> : activeTab === 'rate-settings' ? <RoomRateSettingsPanel active={true} /> : (
                <>
                  {children}
                  <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-slate-300">
                    <h2 className="text-xl font-semibold text-white">Owner Overview</h2>
                    <p className="mt-2 text-sm text-slate-400">This is the main owner workspace view. Switch tabs to manage users, rooms, promos, reservations, or rate settings.</p>
                  </div>
                </>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
