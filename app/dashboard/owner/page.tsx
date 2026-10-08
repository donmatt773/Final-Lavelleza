'use client';

import ReservationDashboardPanel from '@/app/components/ReservationDashboardPanel';

type DashboardTab = 'overview' | 'users' | 'rooms' | 'promos' | 'add-ons' | 'reservations' | 'reports' | 'rate-settings';

export default function OwnerOverviewPage() {
  const handleNavigate = (tab: DashboardTab) => {
    window.dispatchEvent(new CustomEvent('lavelleza:dashboard-navigate', { detail: tab }));
  };

  return <ReservationDashboardPanel onNavigate={handleNavigate} />;
}