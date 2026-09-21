import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import User from '@/app/lib/User';
import { buildSessionCookie } from '@/app/lib/auth';
import { hashPassword, isPasswordHash, verifyPassword } from '@/app/lib/password';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function POST(request: Request) {
  try {
    await connectDB();
    const body = await request.json();
    const loginId = typeof body?.employeeId === 'string' ? body.employeeId.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!loginId || !password) {
      return NextResponse.json(
        { success: false, message: 'Employee ID or username and password are required.' },
        { status: 400 }
      );
    }

    const userMatch = await User.findOne({
      $or: [
        { employeeId: { $regex: `^${escapeRegExp(loginId)}$`, $options: 'i' } },
        { username: { $regex: `^${escapeRegExp(loginId)}$`, $options: 'i' } },
      ],
    });

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
  } catch (error) {
    console.error('LOGIN API ERROR:', error);
    return NextResponse.json(
      { success: false, message: 'Database Connection Error' },
      { status: 500 }
    );
  }
}