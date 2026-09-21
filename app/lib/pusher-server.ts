import Pusher from 'pusher';

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID || '',
  key: process.env.PUSHER_KEY || '',
  secret: process.env.PUSHER_SECRET || '',
  cluster: process.env.PUSHER_CLUSTER || 'us2',
  useTLS: true,
});

export async function triggerDashboardUpdate(
  eventName: string,
  payload: Record<string, unknown> = {}
) {
  if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_KEY || !process.env.PUSHER_SECRET) {
    console.warn('Pusher server env vars are missing. Dashboard update event was not sent.');
    return;
  }

  const eventPayload = {
    updatedAt: new Date().toISOString(),
    ...payload,
  };

  await pusher.trigger('dashboard-updates', eventName, eventPayload);
}

export async function triggerReservationUpdate(
  reservationId: string,
  extra: Record<string, unknown> = {}
) {
  await triggerDashboardUpdate('reservation-updated', {
    reservationId,
    ...extra,
  });
}
