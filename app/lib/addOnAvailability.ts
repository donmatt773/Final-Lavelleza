import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import AddOn from '@/app/lib/AddOn';
import Reservation from '@/app/lib/Reservation';

const STOCK_HOLDING_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN'] as const;

export class AddOnAvailabilityError extends Error {}
export class AddOnInventoryBusyError extends Error {}

type StockedAddOn = {
  _id: unknown;
  stockQuantity?: number | null;
};

export async function withAddOnInventoryLock<T>(addOnIds: string[], operation: () => Promise<T>) {
  const uniqueIds = Array.from(new Set(addOnIds.filter((id) => mongoose.Types.ObjectId.isValid(id)))).sort();
  if (uniqueIds.length === 0) return operation();

  const stockedAddOns = await AddOn.find({ _id: { $in: uniqueIds } })
    .select('_id +stockLockExpiresAt')
    .lean();
  const lockableIds = stockedAddOns.map((addOn) => String(addOn._id)).sort();
  if (lockableIds.length === 0) return operation();

  const lockToken = randomUUID();
  const lockExpiresAt = new Date(Date.now() + 120_000);
  const lockedIds: string[] = [];

  try {
    for (const addOnId of lockableIds) {
      const now = new Date();
      const locked = await AddOn.findOneAndUpdate(
        {
          _id: addOnId,
          $or: [
            { stockLockExpiresAt: { $exists: false } },
            { stockLockExpiresAt: null },
            { stockLockExpiresAt: { $lte: now } },
          ],
        },
        { $set: { stockLockToken: lockToken, stockLockExpiresAt: lockExpiresAt } },
        { new: true, timestamps: false }
      ).select('_id').lean();

      if (!locked) {
        throw new AddOnInventoryBusyError('Add-on availability is being updated. Please try again.');
      }
      lockedIds.push(addOnId);
    }

    return await operation();
  } finally {
    if (lockedIds.length > 0) {
      await AddOn.updateMany(
        { _id: { $in: lockedIds }, stockLockToken: lockToken },
        { $set: { stockLockToken: null, stockLockExpiresAt: null } },
        { timestamps: false }
      );
    }
  }
}

export async function getAddOnAvailability({
  addOns,
  checkIn,
  checkOut,
  excludeReservationId,
}: {
  addOns: StockedAddOn[];
  checkIn?: Date;
  checkOut?: Date;
  excludeReservationId?: string;
}) {
  const availableById = new Map<string, number | null>();
  const stockedAddOns = addOns.filter((addOn) => addOn.stockQuantity !== null && addOn.stockQuantity !== undefined);
  const stockedIds = stockedAddOns.map((addOn) => String(addOn._id));

  addOns.forEach((addOn) => {
    const id = String(addOn._id);
    availableById.set(id, addOn.stockQuantity === null || addOn.stockQuantity === undefined ? null : Number(addOn.stockQuantity));
  });

  if (stockedIds.length === 0 || !checkIn || !checkOut || checkOut <= checkIn) return availableById;

  const query: Record<string, unknown> = {
    reservationStatus: { $in: STOCK_HOLDING_STATUSES },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
    'addOns.addOnId': { $in: stockedIds.map((id) => new mongoose.Types.ObjectId(id)) },
  };

  if (excludeReservationId && mongoose.Types.ObjectId.isValid(excludeReservationId)) {
    query._id = { $ne: new mongoose.Types.ObjectId(excludeReservationId) };
  }

  const reservations = await Reservation.find(query).select('addOns').lean();
  const reservedById = new Map<string, number>();

  reservations.forEach((reservation) => {
    (reservation.addOns || []).forEach((reservedAddOn) => {
      const addOnId = String(reservedAddOn.addOnId);
      if (!stockedIds.includes(addOnId)) return;
      reservedById.set(addOnId, (reservedById.get(addOnId) || 0) + Number(reservedAddOn.quantity || 0));
    });
  });

  stockedAddOns.forEach((addOn) => {
    const id = String(addOn._id);
    availableById.set(id, Math.max(0, Number(addOn.stockQuantity) - (reservedById.get(id) || 0)));
  });

  return availableById;
}