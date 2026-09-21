import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/la_velleza';

const ADD_ON_SEEDS = [
  {
    name: 'Extra Pillow',
    description: 'Additional standard pillow.',
    category: 'BEDDING',
    price: 50,
    stockQuantity: 30,
    isActive: true,
  },
  {
    name: 'Extra Blanket',
    description: 'Additional single blanket.',
    category: 'BEDDING',
    price: 150,
    stockQuantity: 15,
    isActive: true,
  },
  {
    name: 'Extra Towel',
    description: 'Additional bath towel.',
    category: 'BATHROOM',
    price: 75,
    stockQuantity: 40,
    isActive: true,
  },
  {
    name: 'Toiletry Set',
    description: 'Soap, shampoo, and toothbrush set.',
    category: 'BATHROOM',
    price: 100,
    stockQuantity: 50,
    isActive: true,
  },
  {
    name: 'Drinking Water',
    description: 'One bottled drinking water.',
    category: 'FOOD_AND_BEVERAGE',
    price: 30,
    stockQuantity: 100,
    isActive: true,
  },
  {
    name: 'Breakfast Meal',
    description: 'One standard breakfast meal.',
    category: 'FOOD_AND_BEVERAGE',
    price: 250,
    stockQuantity: null,
    isActive: true,
  },
  {
    name: 'Extra Bed',
    description: 'Additional temporary bed setup.',
    category: 'ROOM_SERVICE',
    price: 500,
    stockQuantity: 5,
    isActive: true,
  },
];

async function seedAddOns() {
  await mongoose.connect(MONGODB_URI);
  const addOnsCollection = mongoose.connection.collection('add_ons');

  for (const addOnSeed of ADD_ON_SEEDS) {
    const now = new Date();
    const existing = await addOnsCollection.findOne(
      { name: { $regex: `^${addOnSeed.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } },
      { projection: { _id: 1 } }
    );

    if (existing) {
      await addOnsCollection.updateOne(
        { _id: existing._id },
        { $set: { ...addOnSeed, updatedAt: now } }
      );
      console.log(`Updated add-on: ${addOnSeed.name}`);
    } else {
      await addOnsCollection.insertOne({ ...addOnSeed, createdAt: now, updatedAt: now });
      console.log(`Inserted add-on: ${addOnSeed.name}`);
    }
  }
}

seedAddOns()
  .then(() => {
    console.log('Add-on seed complete.');
  })
  .catch((error) => {
    console.error('Failed to seed add-ons:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
