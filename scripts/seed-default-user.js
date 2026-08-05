import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/la_velleza';

async function seedDefaultUser() {
  await mongoose.connect(MONGODB_URI);

  const usersCollection = mongoose.connection.collection('users');

  const hashedPassword = await bcrypt.hash('admin123', 10);

  const defaultAdmin = {
    employeeId: 'ADMIN',
    username: 'admin',
    name: 'Administrator',
    password: hashedPassword,
    role: 0
  };

  const result = await usersCollection.updateOne(
    { employeeId: defaultAdmin.employeeId },
    {
      $set: {
        username: defaultAdmin.username,
        name: defaultAdmin.name,
        password: defaultAdmin.password,
        role: defaultAdmin.role,
        updatedAt: new Date()
      },
      $setOnInsert: {
        createdAt: new Date()
      }
    },
    { upsert: true }
  );

  if (result.upsertedCount > 0) {
    console.log('Default admin user created.');
  } else {
    console.log('Default admin user already existed and was updated.');
  }
}

seedDefaultUser()
  .catch((error) => {
    console.error('Failed to seed default admin user:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });