import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/la_velleza';

const BED_TYPES = ['Single Bed', 'Double Bed', 'Double Deck Bed'];

const FEATURES = [
  'Dipping Pool',
  'Kitchen',
  'Function Hall',
  'Restaurant',
  'Swimming Pools',
  'Cottages',
  'Spacious Parking',
];

const AMENITIES = [
  'Complimentary Breakfast',
  'Bottled Water',
  'Fully Air-Conditioned',
  'Swimming Pool',
  'Private Comfort Rooms',
  'Smart TV',
  'Free Wi-Fi',
  'Personalized Guest Kits',
];

const DEFAULT_RATE_SETTINGS = {
  key: 'default',
  checkInTime: '1:00 PM',
  checkOutTime: '11:00 AM',
  extraPersonRate: 150,
  childExemptionAge: 9,
  extraSingleBedRate: 300,
  extraDoubleBedRate: 500,
  halfDayCutoffTime: '6:00 PM',
  beforeCutoffRateType: 'HALF_DAY',
  afterCutoffRateType: 'WHOLE_DAY',
};

const ROOM_SEEDS = [
  {
    name: 'Room 3',
    code: 'RM-003',
    maxGuests: 3,
    nightlyRate: 1800,
    beds: [
      { bedType: 'Double Bed', quantity: 1 },
      { bedType: 'Single Bed', quantity: 1 },
    ],
    features: [],
  },
  {
    name: 'Room 2',
    code: 'RM-002',
    maxGuests: 4,
    nightlyRate: 2500,
    beds: [{ bedType: 'Double Bed', quantity: 2 }],
    features: [],
  },
  {
    name: 'Room 4',
    code: 'RM-004',
    maxGuests: 4,
    nightlyRate: 2500,
    beds: [{ bedType: 'Double Bed', quantity: 2 }],
    features: [],
  },
  {
    name: 'A-House',
    code: 'A-HOUSE',
    maxGuests: 2,
    nightlyRate: 2500,
    beds: [{ bedType: 'Double Bed', quantity: 1 }],
    features: ['Dipping Pool'],
  },
  {
    name: 'Candy House 1',
    code: 'CANDY-HOUSE-1',
    maxGuests: 9,
    nightlyRate: 6000,
    beds: [{ bedType: 'Double Deck Bed', quantity: 3 }],
    features: ['Kitchen'],
  },
  {
    name: 'Candy House 2',
    code: 'CANDY-HOUSE-2',
    maxGuests: 9,
    nightlyRate: 6000,
    beds: [{ bedType: 'Double Deck Bed', quantity: 3 }],
    features: ['Kitchen'],
  },
  {
    name: 'Candy House 3A',
    code: 'CANDY-HOUSE-3A',
    maxGuests: 2,
    nightlyRate: 1800,
    beds: [{ bedType: 'Double Bed', quantity: 1 }],
    features: [],
  },
  {
    name: 'Candy House 3B',
    code: 'CANDY-HOUSE-3B',
    maxGuests: 2,
    nightlyRate: 1800,
    beds: [{ bedType: 'Double Bed', quantity: 1 }],
    features: [],
  },
  {
    name: 'Barkadahan Room',
    code: 'BARKADAHAN-ROOM',
    maxGuests: 21,
    nightlyRate: 9000,
    beds: [{ bedType: 'Double Deck Bed', quantity: 3 }],
    features: ['Kitchen'],
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function ensureLookupRecords(collection, names) {
  const map = new Map();

  for (const [index, name] of names.entries()) {
    const slug = slugify(name);
    const now = new Date();

    await collection.updateOne(
      { slug },
      {
        $setOnInsert: {
          createdAt: now,
        },
        $set: {
          name,
          slug,
          isActive: true,
          sortOrder: index,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    const doc = await collection.findOne({ slug }, { projection: { _id: 1, name: 1, slug: 1 } });
    map.set(name, doc._id);
  }

  return map;
}

async function seedRooms() {
  await mongoose.connect(MONGODB_URI);

  const bedTypesCollection = mongoose.connection.collection('bedtypes');
  const featuresCollection = mongoose.connection.collection('features');
  const amenitiesCollection = mongoose.connection.collection('amenities');
  const roomsCollection = mongoose.connection.collection('rooms');
  const rateSettingsCollection = mongoose.connection.collection('rate_settings');

  const bedTypeIdMap = await ensureLookupRecords(bedTypesCollection, BED_TYPES);
  const featureIdMap = await ensureLookupRecords(featuresCollection, FEATURES);
  const amenityIdMap = await ensureLookupRecords(amenitiesCollection, AMENITIES);

  const amenityIds = AMENITIES.map((name) => amenityIdMap.get(name)).filter(Boolean);

  await rateSettingsCollection.updateOne(
    { key: 'default' },
    {
      $setOnInsert: { createdAt: new Date() },
      $set: {
        ...DEFAULT_RATE_SETTINGS,
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );

  console.log('Upserted default rate settings.');

  for (const room of ROOM_SEEDS) {
    const now = new Date();
    const beds = room.beds.map((bed) => ({
      bedTypeId: bedTypeIdMap.get(bed.bedType),
      quantity: bed.quantity,
    }));

    const features = room.features.map((featureName) => featureIdMap.get(featureName));

    const payload = {
      name: room.name,
      code: room.code,
      description: '',
      maxGuests: room.maxGuests,
      status: 'AVAILABLE',
      nightlyRate: room.nightlyRate,
      halfDayRate: room.nightlyRate,
      wholeDayRate: room.nightlyRate,
      beds,
      features,
      amenities: amenityIds,
      images: [],
      primaryImageId: null,
      isArchived: false,
      archivedAt: null,
      updatedAt: now,
    };

    const existing = await roomsCollection.findOne({
      $or: [
        { code: room.code },
        { name: { $regex: `^${room.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      ],
    });

    if (existing) {
      await roomsCollection.updateOne(
        { _id: existing._id },
        {
          $set: payload,
        }
      );
      console.log(`Updated room: ${room.name} (${room.code})`);
    } else {
      await roomsCollection.insertOne({
        ...payload,
        createdAt: now,
      });
      console.log(`Inserted room: ${room.name} (${room.code})`);
    }
  }
}

seedRooms()
  .then(() => {
    console.log('Room seed complete.');
  })
  .catch((error) => {
    console.error('Failed to seed rooms:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
