import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/la_velleza';

if (!process.env.MONGODB_URI && process.env.NODE_ENV === 'production') {
  // Fails loudly on the server instead of silently returning empty data everywhere,
  // which is what happens if this connects to a localhost Mongo that doesn't exist on Vercel.
  console.error(
    'MONGODB_URI is not set. Set it in Vercel → Project → Settings → Environment Variables.'
  );
}

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithCache = globalThis as typeof globalThis & {
  mongoose?: MongooseCache;
};

const cached: MongooseCache = globalWithCache.mongoose || { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI).then((m) => m);
  }
  cached.conn = await cached.promise;
  globalWithCache.mongoose = cached;
  return cached.conn;
}