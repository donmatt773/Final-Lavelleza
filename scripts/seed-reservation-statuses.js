import mongoose from 'mongoose';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Load .env if present so MONGODB_URI resolves locally.
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/la_velleza';

function dayFromNow(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function buildPricing(total) {
  return {
    nights: 1,
    roomRate: total,
    packageRate: 0,
    packageRoomRate: 0,
    extraPersonFee: 0,
    extraBedFee: 0,
    addOns: [],
    promoDiscount: 0,
    additionalRoomDiscount: 0,
    roomBreakdown: [],
    subtotal: total,
    grandTotal: total,
  };
}

const STATUS_SEEDS = [
  { status: 'PENDING', paymentStatus: 'UNPAID', source: 'ONLINE', checkInOffset: 3, checkOutOffset: 4 },
  { status: 'CONFIRMED', paymentStatus: 'PARTIALLY_PAID', source: 'ONLINE', checkInOffset: 2, checkOutOffset: 3 },
  { status: 'CHECKED_IN', paymentStatus: 'PAID', source: 'WALK_IN', checkInOffset: 0, checkOutOffset: 1 },
  { status: 'CHECKED_OUT', paymentStatus: 'PAID', source: 'ONLINE', checkInOffset: -3, checkOutOffset: -2 },
  { status: 'NO_SHOW', paymentStatus: 'UNPAID', source: 'ONLINE', checkInOffset: -1, checkOutOffset: 0 },
  { status: 'CANCELLED', paymentStatus: 'REFUNDED', source: 'ONLINE', checkInOffset: 5, checkOutOffset: 6 },
];

async function seed() {
  await mongoose.connect(MONGODB_URI);

  const reservationsCollection = mongoose.connection.collection('reservations');
  const roomsCollection = mongoose.connection.collection('rooms');

  const room = await roomsCollection.findOne({ isArchived: { $ne: true } });
  if (!room) {
    console.error('No room found. Run scripts/seed-rooms.js first.');
    process.exit(1);
  }

  for (const seed of STATUS_SEEDS) {
    const reservationNumber = `SEED-${seed.status}`;
    const now = new Date();
    const checkIn = dayFromNow(seed.checkInOffset);
    const checkOut = dayFromNow(seed.checkOutOffset);
    const total = 2500;

    const payload = {
      reservationNumber,
      guestName: `Seed Guest (${seed.status})`,
      email: '',
      phone: '09171234567',
      address: 'Seed Address',
      room: room._id,
      roomAssignments: [{ room: room._id, adults: 2, children: 0 }],
      roomCheckOuts: [{ room: room._id, checkOut }],
      promo: null,
      adults: 2,
      children: 0,
      checkIn,
      checkOut,
      specialRequests: '',
      addOns: [],
      reservationStatus: seed.status,
      paymentStatus: seed.paymentStatus,
      reservationSource: seed.source,
      checkInAt: seed.status === 'CHECKED_IN' || seed.status === 'CHECKED_OUT' ? checkIn : null,
      checkOutAt: seed.status === 'CHECKED_OUT' ? checkOut : null,
      checkedInBy: seed.status === 'CHECKED_IN' || seed.status === 'CHECKED_OUT' ? 'SEED' : null,
      checkedOutBy: seed.status === 'CHECKED_OUT' ? 'SEED' : null,
      statusHistory: [{ fromStatus: null, toStatus: seed.status, changedAt: now, staffMember: 'SEED' }],
      pricingSummary: buildPricing(total),
      createdBy: seed.source === 'WALK_IN' ? 'SEED' : 'PUBLIC',
      updatedAt: now,
    };

    await reservationsCollection.updateOne(
      { reservationNumber },
      { $setOnInsert: { createdAt: now }, $set: payload },
      { upsert: true }
    );

    console.log(`Upserted ${reservationNumber} (${seed.status}).`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
