'use client';

import { useEffect } from 'react';
import Pusher from 'pusher-js';

export type DashboardReservationEvent = {
  reservationId?: string;
  reservationStatus?: string;
  reservationSource?: string;
  type?: string;
};

export function useDashboardReservationRealtime(
  refetch: () => Promise<unknown>,
  onReservationCreated?: (event: DashboardReservationEvent) => void
) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      console.warn('Pusher client env vars are missing. Realtime dashboard updates are disabled.');
      return;
    }

    const pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
    });

    const channel = pusher.subscribe('dashboard-updates');

    channel.bind('reservation-updated', async (event: DashboardReservationEvent) => {
      if (event?.type === 'reservation-created') onReservationCreated?.(event);
      try {
        await refetch();
      } catch (error) {
        console.error('Refetch after reservation update failed:', error);
      }
    });

    channel.bind('dashboard-updated', async () => {
      try {
        await refetch();
      } catch (error) {
        console.error('Refetch after dashboard update failed:', error);
      }
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe('dashboard-updates');
      pusher.disconnect();
    };
  }, [refetch, onReservationCreated]);
}
