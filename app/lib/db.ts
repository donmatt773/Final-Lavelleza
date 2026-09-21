import mongoose from 'mongoose';

function getMongoDbUri() {
  const configuredUri = process.env.MONGODB_URI?.trim();

  if (!configuredUri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is not configured for this deployment.');
    }

    return 'mongodb://127.0.0.1:27017/la_velleza';
  }

  const uri = configuredUri
    .replace(/^MONGODB_URI\s*=\s*/i, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
  }

  return uri;
}

const MONGODB_URI = getMongoDbUri();

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