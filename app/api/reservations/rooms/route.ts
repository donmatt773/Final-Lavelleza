import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import Room from '@/app/lib/Room';
import { requireOwnerOrStaff } from '@/app/lib/auth';

export async function GET(request: Request) {
  try {
    const authError = requireOwnerOrStaff(request);
    if (authError) return authError;

    await connectDB();

    const rooms = await Room.find({ isArchived: false, status: 'AVAILABLE' })
      .select('name code')
      .sort({ name: 1 })
      .lean();

    const roomOptions = rooms.map((room) => ({
      _id: String(room._id),
      name: String(room.name || ''),
      code: String(room.code || ''),
    }));

    return NextResponse.json({ success: true, rooms: roomOptions }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load room options.' }, { status: 500 });
  }
}
