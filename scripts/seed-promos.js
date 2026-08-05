import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/la_velleza';

function buildCurrentYearValidity() {
  return {
    startDate: new Date('2025-01-01T00:00:00.000Z'),
    endDate: new Date('2027-12-31T23:59:59.999Z'),
  };
}

function createPromoSeeds({ barkadahanRoomId, standardRoomId }) {
  const { startDate, endDate } = buildCurrentYearValidity();

  const celebrateRoomId = barkadahanRoomId || standardRoomId || null;
  const holidayRoomId = standardRoomId || barkadahanRoomId || null;
  const familyRoomId = barkadahanRoomId || standardRoomId || null;

  return [
    {
      name: 'Celebrate & Stay Promo',
      code: 'CELEBRATE_STAY',
      codeNormalized: 'CELEBRATE_STAY',
      description: 'Celebrate your special occasion with a function hall package that includes food, accommodations, and complimentary resort amenities.',
      packagePrice: 39000,
      currency: 'PHP',
      status: 'ACTIVE',
      startDate,
      endDate,
      timezone: 'Asia/Manila',
      banner: {
        fileUrl: '/file.svg',
        altText: 'Celebrate & Stay Promo Banner',
      },
      includedPax: 60,
      includedRoomIds: celebrateRoomId ? [celebrateRoomId] : [],
      inclusions: [
        {
          type: 'FACILITY',
          name: 'Function Hall',
          description: '8:00 AM - 8:00 PM',
          sortOrder: 1,
          isOptional: false,
        },
        {
          type: 'ROOM',
          name: 'Barkadahan Room',
          roomId: celebrateRoomId || undefined,
          quantity: 1,
          sortOrder: 2,
          isOptional: false,
        },
        {
          type: 'FOOD',
          name: 'Food for 60 Pax',
          description: '3 Main Dishes, Rice, Drinks and Fruits',
          quantity: 60,
          unit: 'PAX',
          pax: 60,
          sortOrder: 3,
          isOptional: false,
        },
        {
          type: 'FACILITY',
          name: 'Free Pool Access',
          description: '50 Pax',
          quantity: 50,
          unit: 'PAX',
          pax: 50,
          sortOrder: 4,
          isOptional: false,
        },
        {
          type: 'SERVICE',
          name: 'Free Sound System',
          sortOrder: 5,
          isOptional: false,
        },
        {
          type: 'SERVICE',
          name: 'Free Simple Backdrop Design',
          sortOrder: 6,
          isOptional: false,
        },
      ],
      termsAndConditions: [
        'Subject to availability',
        'Advance reservation required',
        'Additional requests may incur extra charges',
      ],
      notes: 'Official La Velleza promotional package.',
      additionalRoomDiscount: null,
      isArchived: false,
    },
    {
      name: 'Holiday Resort Promo',
      code: 'HOLIDAY_RESORT',
      codeNormalized: 'HOLIDAY_RESORT',
      description: 'Holiday resort package with accommodation and resort access.',
      packagePrice: 28000,
      currency: 'PHP',
      status: 'ACTIVE',
      startDate,
      endDate,
      timezone: 'Asia/Manila',
      banner: {
        fileUrl: '/globe.svg',
        altText: 'Holiday Resort Promo Banner',
      },
      includedPax: 50,
      includedRoomIds: holidayRoomId ? [holidayRoomId] : [],
      inclusions: [
        {
          type: 'FACILITY',
          name: 'Function Hall',
          description: '8:00 AM - 8:00 PM',
          sortOrder: 1,
          isOptional: false,
        },
        {
          type: 'ROOM',
          name: '1 Accommodation Room',
          roomId: holidayRoomId || undefined,
          quantity: 1,
          sortOrder: 2,
          isOptional: false,
        },
        {
          type: 'FACILITY',
          name: 'Free Pool Access',
          description: '50 Pax',
          quantity: 50,
          unit: 'PAX',
          pax: 50,
          sortOrder: 3,
          isOptional: false,
        },
        {
          type: 'SERVICE',
          name: 'Simple Backdrop Design',
          sortOrder: 4,
          isOptional: false,
        },
        {
          type: 'SERVICE',
          name: 'Sound System',
          sortOrder: 5,
          isOptional: false,
        },
        {
          type: 'DISCOUNT',
          name: 'Discount for Additional Rooms',
          sortOrder: 6,
          isOptional: false,
        },
      ],
      termsAndConditions: [
        'Further requests may differ',
        'Subject to availability',
      ],
      notes: 'Official La Velleza promotional package.',
      additionalRoomDiscount: null,
      isArchived: false,
    },
    {
      name: 'Family Reunion Promo',
      code: 'FAMILY_REUNION',
      codeNormalized: 'FAMILY_REUNION',
      description: 'Family reunion package designed for large gatherings with food, accommodations, and entertainment.',
      packagePrice: 45000,
      currency: 'PHP',
      status: 'ACTIVE',
      startDate,
      endDate,
      timezone: 'Asia/Manila',
      banner: {
        fileUrl: '/window.svg',
        altText: 'Family Reunion Promo Banner',
      },
      includedPax: 100,
      includedRoomIds: familyRoomId ? [familyRoomId] : [],
      inclusions: [
        {
          type: 'FACILITY',
          name: 'Function Hall',
          description: '8:00 AM - 8:00 PM',
          sortOrder: 1,
          isOptional: false,
        },
        {
          type: 'FOOD',
          name: 'Food for 100 Pax',
          quantity: 100,
          unit: 'PAX',
          pax: 100,
          sortOrder: 2,
          isOptional: false,
        },
        {
          type: 'ROOM',
          name: 'Free Barkadahan Room',
          description: 'Includes Boodle Fight Breakfast',
          roomId: familyRoomId || undefined,
          quantity: 1,
          sortOrder: 3,
          isOptional: false,
        },
        {
          type: 'FACILITY',
          name: 'Free Pool Access',
          description: '50 Pax',
          quantity: 50,
          unit: 'PAX',
          pax: 50,
          sortOrder: 4,
          isOptional: false,
        },
        {
          type: 'SERVICE',
          name: 'Free Welcome Banner',
          sortOrder: 5,
          isOptional: false,
        },
        {
          type: 'SERVICE',
          name: 'Free Videoke',
          sortOrder: 6,
          isOptional: false,
        },
      ],
      termsAndConditions: [
        'Further requests may differ',
        'Reservation required',
      ],
      notes: 'Official La Velleza promotional package.',
      additionalRoomDiscount: null,
      isArchived: false,
    },
  ];
}

function removeUndefinedFields(value) {
  if (value instanceof Date) {
    return value;
  }

  if (value && typeof value === 'object' && value._bsontype === 'ObjectId') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(removeUndefinedFields).filter((item) => item !== undefined);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const entries = Object.entries(value)
    .filter(([, fieldValue]) => fieldValue !== undefined)
    .map(([key, fieldValue]) => [key, removeUndefinedFields(fieldValue)]);

  return Object.fromEntries(entries);
}

async function findRoomReferences(roomsCollection) {
  const barkadahanByCode = await roomsCollection.findOne(
    { code: 'BARKADAHAN-ROOM' },
    { projection: { _id: 1, name: 1, code: 1 } }
  );

  const barkadahanByName = barkadahanByCode
    ? barkadahanByCode
    : await roomsCollection.findOne(
        { name: { $regex: '^Barkadahan Room$', $options: 'i' } },
        { projection: { _id: 1, name: 1, code: 1 } }
      );

  const standardRoom = await roomsCollection.findOne(
    {
      isArchived: { $ne: true },
      name: { $not: /^Barkadahan Room$/i },
      maxGuests: { $lte: 4 },
    },
    { projection: { _id: 1, name: 1, code: 1 }, sort: { createdAt: 1 } }
  );

  const fallbackRoom = standardRoom || await roomsCollection.findOne(
    { isArchived: { $ne: true } },
    { projection: { _id: 1, name: 1, code: 1 }, sort: { createdAt: 1 } }
  );

  return {
    barkadahanRoomId: barkadahanByName ? barkadahanByName._id : null,
    standardRoomId: fallbackRoom ? fallbackRoom._id : null,
  };
}

async function seedPromos() {
  await mongoose.connect(MONGODB_URI);

  const promosCollection = mongoose.connection.collection('promos');
  const roomsCollection = mongoose.connection.collection('rooms');

  const roomRefs = await findRoomReferences(roomsCollection);
  const seeds = createPromoSeeds(roomRefs);

  for (const promoSeed of seeds) {
    const now = new Date();
    const existing = await promosCollection.findOne(
      {
        $or: [
          { codeNormalized: promoSeed.codeNormalized },
          { name: { $regex: `^${promoSeed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
        ],
      },
      { projection: { _id: 1 } }
    );

    const payload = removeUndefinedFields(promoSeed);

    if (existing) {
      await promosCollection.updateOne(
        { _id: existing._id },
        {
          $set: {
            ...payload,
            updatedAt: now,
          },
        }
      );
      console.log(`Updated promo: ${promoSeed.name} (${promoSeed.code})`);
      continue;
    }

    await promosCollection.insertOne({
      ...payload,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Inserted promo: ${promoSeed.name} (${promoSeed.code})`);
  }
}

seedPromos()
  .then(() => {
    console.log('Promo seed complete.');
  })
  .catch((error) => {
    console.error('Failed to seed promos:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });