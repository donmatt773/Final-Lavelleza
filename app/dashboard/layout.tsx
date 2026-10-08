'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import logo from '@/app/icons/logo.jpg';
import UserManagementPanel from '@/app/components/UserManagementPanel';
import RoomManagementPanel from '@/app/components/RoomManagementPanel';
import RoomRateSettingsPanel from '@/app/components/RoomRateSettingsPanel';
import PromoManagementPanel from '@/app/components/PromoManagementPanel';
import ReservationManagementPanel from '@/app/components/ReservationManagementPanel';
import ReservationDashboardPanel from '@/app/components/ReservationDashboardPanel';
import PaymentReportsPanel from '@/app/components/PaymentReportsPanel';
import AddOnManagementPanel from '@/app/components/AddOnManagementPanel';
import SystemActivityLogModal from '@/app/components/SystemActivityLogModal';

type DashboardTab = 'overview' | 'users' | 'rooms' | 'promos' | 'add-ons' | 'reservations' | 'reports' | 'rate-settings';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState<DashboardTab>('reservations');
  const [isOwner, setIsOwner] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [activityLogOpen, setActivityLogOpen] = useState(false);

  React.useEffect(() => {
    // Each call gets its own controller so a stale in-flight request (e.g. from
    // React Strict Mode's mount/cleanup/remount cycle) never blocks or clobbers
    // the result of the request that actually belongs to the live effect run.
    let controller = new AbortController();

    const validateServerSession = async () => {
      controller.abort();
      controller = new AbortController();
      const { signal } = controller;

      try {
        const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store', signal });
        const data = await response.json().catch(() => null);
        const role = Number(data?.role);
        if (!response.ok || !data?.success || (role !== 0 && role !== 1)) {
          localStorage.removeItem('auth_role');
          localStorage.removeItem('auth_name');
          router.replace('/login');
          return;
        }

        setIsOwner(role === 0);
        if (role !== 0) setActiveTab('reservations');
        setSessionReady(true);
      } catch {
        if (signal.aborted) return;
        localStorage.removeItem('auth_role');
        localStorage.removeItem('auth_name');
        router.replace('/login');
      }
    };

    const revalidateAfterHistoryNavigation = () => {
      setSessionReady(false);
      void validateServerSession();
    };

    void validateServerSession();
    window.addEventListener('pageshow', revalidateAfterHistoryNavigation);
    window.addEventListener('popstate', revalidateAfterHistoryNavigation);

    return () => {
      controller.abort();
      window.removeEventListener('pageshow', revalidateAfterHistoryNavigation);
      window.removeEventListener('popstate', revalidateAfterHistoryNavigation);
    };
  }, [router]);

  React.useEffect(() => {
    if (!isOwner || !sessionReady) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyL') {
        event.preventDefault();
        setActivityLogOpen((open) => !open);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOwner, sessionReady]);

  const handleLogout = async () => {
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_name');
    setSessionReady(false);
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // ignore and fall back to the login screen
    }
    router.replace('/login');
  };

  const selectTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setIsMobileNavOpen(false);
  };

  React.useEffect(() => {
    const onNavigateTab = (event: Event) => {
      const tab = (event as CustomEvent<DashboardTab>).detail;
      if (tab) selectTab(tab);
    };
    window.addEventListener('lavelleza:dashboard-navigate', onNavigateTab);
    return () => window.removeEventListener('lavelleza:dashboard-navigate', onNavigateTab);
  }, []);

  if (!sessionReady) {
    return <main className="dashboard-theme flex min-h-screen items-center justify-center text-sm text-slate-400">Checking session...</main>;
  }

  return (
    <div className="dashboard-theme flex min-h-screen">
      <button
        type="button"
        aria-label="Close dashboard navigation"
        tabIndex={isMobileNavOpen ? 0 : -1}
        onClick={() => setIsMobileNavOpen(false)}
        className={`fixed inset-0 z-30 bg-[#1F3A5F]/55 transition-opacity md:hidden ${isMobileNavOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      {/* Persistent System Control Sidebar */}
      <aside className={`dashboard-sidebar fixed inset-y-0 left-0 z-40 flex h-dvh w-72 shrink-0 flex-col justify-between overflow-y-auto border-r p-3 transition-[width,transform] duration-200 md:sticky md:top-0 md:z-auto md:h-screen md:max-h-screen md:p-4 lg:p-6 ${isSidebarCollapsed ? 'md:w-16' : 'md:w-64'} ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="space-y-6">
          {/* Logo Element */}
          <div className={`flex items-center ${isSidebarCollapsed ? 'flex-col justify-center gap-2' : 'justify-between gap-3'} px-1`}>
            <div className="flex min-w-0 items-center gap-3">
              <Image src={logo} alt="La Velleza Resort" className="h-8 w-8 rounded-full object-cover" priority />
              {!isSidebarCollapsed ? <span className="truncate text-sm font-bold tracking-wide text-white">La Velleza System</span> : null}
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((collapsed) => !collapsed)}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-lg text-slate-400 transition hover:bg-slate-800 hover:text-white md:flex"
            >
              {isSidebarCollapsed ? '›' : '‹'}
            </button>
          </div>

          {/* Navigation Links Group */}
          <nav className="space-y-1.5">
            {!isSidebarCollapsed ? <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Main Menu</p> : null}
            <button
              type="button"
              onClick={() => selectTab('overview')}
              aria-label={isOwner ? 'Owner Overview' : 'Overview'}
              className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'overview' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              <span aria-hidden="true">🎛️</span>{!isSidebarCollapsed ? <span>{isOwner ? 'Owner Overview' : 'Overview'}</span> : null}
            </button>
            <button
              type="button"
              onClick={() => selectTab('reservations')}
              aria-label="Reservation Management"
              className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'reservations' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              <span aria-hidden="true">📋</span>{!isSidebarCollapsed ? <span>Reservation Management</span> : null}
            </button>
            {isOwner ? (
              <button
                type="button"
                onClick={() => selectTab('users')}
                aria-label="User Management"
                className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'users' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
              >
                <span aria-hidden="true">👤</span>{!isSidebarCollapsed ? <span>User Management</span> : null}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => selectTab('rooms')}
              aria-label="Room Management"
              className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'rooms' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              <span aria-hidden="true">🛏️</span>{!isSidebarCollapsed ? <span>Room Management</span> : null}
            </button>
            {isOwner ? (
              <button
              type="button"
              onClick={() => selectTab('promos')}
              aria-label="Promo Management"
              className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'promos' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
              >
                <span aria-hidden="true">🎁</span>{!isSidebarCollapsed ? <span>Promo Management</span> : null}
              </button>
            ) : null}
            {isOwner ? (
              <button
              type="button"
              onClick={() => selectTab('add-ons')}
              aria-label="Add-On Management"
              className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'add-ons' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
              >
                <span aria-hidden="true">🧺</span>{!isSidebarCollapsed ? <span>Add-On Management</span> : null}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => selectTab('reports')}
              aria-label="Payment Reports"
              className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'reports' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
            >
              <span aria-hidden="true">📊</span>{!isSidebarCollapsed ? <span>Payment Reports</span> : null}
            </button>
            {isOwner ? (
              <button
              type="button"
              onClick={() => selectTab('rate-settings')}
              aria-label="Rate Settings & Mail"
              className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center' : ''} gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all ${activeTab === 'rate-settings' ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'text-slate-400 hover:bg-slate-800/30 hover:text-white'}`}
              >
                <span aria-hidden="true">⚙️</span>{!isSidebarCollapsed ? <span className="truncate">Rate Settings &amp; Mail</span> : null}
              </button>
            ) : null}
          </nav>
        </div>

        {/* Action Controls Group */}
        <div className="border-t border-slate-800/60 pt-4">
          <button 
            onClick={handleLogout}
            aria-label="Logout"
            className="dashboard-logout flex w-full items-center justify-center rounded-lg border py-2.5 text-xs font-semibold shadow-sm transition-all"
          >
            <span aria-hidden="true">🛑</span>{!isSidebarCollapsed ? <span className="ml-2"> Logout</span> : null}
          </button>
        </div>
      </aside>

      {/* Main Core Component Viewport Area */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="p-3 md:p-6 lg:p-8">
          <div className="sticky top-0 z-20 -mx-3 -mt-3 mb-4 flex items-center justify-between border-b border-[#17263A1F] bg-[#FBF3E4]/95 px-3 py-3 backdrop-blur md:hidden">
            <button
              type="button"
              aria-label="Open dashboard navigation"
              aria-expanded={isMobileNavOpen}
              onClick={() => setIsMobileNavOpen(true)}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-[#17263A33] px-3 text-sm font-semibold text-[#1F3A5F]"
            >
              <span aria-hidden="true" className="flex flex-col gap-1">
                <span className="h-px w-4 bg-current" />
                <span className="h-px w-4 bg-current" />
                <span className="h-px w-4 bg-current" />
              </span>
              Menu
            </button>
            <span className="font-serif text-sm font-semibold text-[#1F3A5F]">La Velleza Resort</span>
          </div>
          {pathname?.includes('/dashboard/owner') || pathname?.includes('/dashboard/staff') ? (
            <div className="mt-2">
              {activeTab === 'users' && isOwner ? <UserManagementPanel active={true} /> : activeTab === 'rooms' ? <RoomManagementPanel active={true} staffMode={!isOwner} /> : activeTab === 'promos' && isOwner ? <PromoManagementPanel active={true} /> : activeTab === 'add-ons' && isOwner ? <AddOnManagementPanel active={true} /> : activeTab === 'reservations' ? <ReservationManagementPanel active={true} canManageGmail={isOwner} /> : activeTab === 'reports' ? <PaymentReportsPanel active={true} /> : activeTab === 'rate-settings' && isOwner ? <RoomRateSettingsPanel active={true} /> : (
                <>
                  {isOwner ? children : (
                    <>
                      <ReservationDashboardPanel onNavigate={selectTab} />
                      <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-slate-300">
                        <h2 className="text-xl font-semibold text-white">Staff Overview</h2>
                        <p className="mt-2 text-sm text-slate-400">Use the tabs to switch between the overview, reservations, and payment reports.</p>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            children
          )}
        </div>
      </div>
      <SystemActivityLogModal open={activityLogOpen && isOwner} onClose={() => setActivityLogOpen(false)} />
    </div>
  );
}
