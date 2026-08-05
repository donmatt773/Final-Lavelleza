import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import User from '@/app/lib/User';
import { buildSessionCookie } from '@/app/lib/auth';
import { hashPassword, isPasswordHash, verifyPassword } from '@/app/lib/password';

export async function POST(request: Request) {
  try {
    await connectDB();
    const { employeeId, password } = await request.json();

    const userMatch = await User.findOne({ employeeId: employeeId.toUpperCase() });

    if (!userMatch) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials parsed by database.' },
        { status: 401 }
      );
    }

    const isValidPassword = await verifyPassword(password, userMatch.password);

    if (!isValidPassword) {
      return NextResponse.json(
        { success: false, message: 'Invalid credentials parsed by database.' },
        { status: 401 }
      );
    }

    // Auto-upgrade older plain-text records to hashed passwords after a successful login.
    if (!isPasswordHash(userMatch.password)) {
      userMatch.password = await hashPassword(password);
      await userMatch.save();
    }

    const response = NextResponse.json({
      success: true,
      name: userMatch.name,
      role: userMatch.role,
      message: 'Authentication successful.'
    });

    response.headers.set('Set-Cookie', buildSessionCookie({
      sub: String(userMatch._id),
      role: userMatch.role,
      employeeId: String(userMatch.employeeId),
      name: String(userMatch.name),
      exp: Date.now() + 60 * 60 * 8 * 1000,
    }));

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: 'Database Connection Error' },
      { status: 500 }
    );
  }
}