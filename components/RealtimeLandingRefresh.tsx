'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Pusher from 'pusher-js';

export default function RealtimeLandingRefresh() {
  const router = useRouter();

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      return;
    }

    const pusher = new Pusher(key, {
      cluster,
      forceTLS: true,
    });

    const channel = pusher.subscribe('dashboard-updates');

    const handleUpdate = () => {
      router.refresh();
    };

    channel.bind('reservation-updated', handleUpdate);
    channel.bind('dashboard-updated', handleUpdate);

    return () => {
      channel.unbind('reservation-updated', handleUpdate);
      channel.unbind('dashboard-updated', handleUpdate);
      pusher.unsubscribe('dashboard-updates');
      pusher.disconnect();
    };
  }, [router]);

  return null;
}
