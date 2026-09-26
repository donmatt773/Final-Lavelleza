import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import User from '@/app/lib/User';
import { hashPassword } from '@/app/lib/password';
import { requireOwner } from '@/app/lib/auth';
import { writeAuditLog } from '@/app/lib/auditLogWriter';

export async function GET(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;
    await connectDB();
    const users = await User.find({}).select('-password').sort({ createdAt: -1 }).lean();
    return NextResponse.json(users);
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load users' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;
    await connectDB();
    const body = await request.json();

    if (!body?.employeeId || !body?.username || !body?.name || !body?.password) {
      return NextResponse.json({ success: false, message: 'Employee ID, username, name, and password are required.' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(String(body.password));

    const user = await User.create({
      employeeId: body.employeeId?.toUpperCase(),
      username: body.username?.toLowerCase(),
      name: body.name,
      password: hashedPassword,
      role: Number(body.role ?? 1),
    });

    const { password: _password, ...responseUser } = user.toObject();
    await writeAuditLog(request, {
      action: 'CREATE',
      entityType: 'USER',
      entityId: String(user._id),
      entityLabel: `${user.name} (${user.employeeId})`,
      summary: 'Created a staff account.',
      changedFields: ['name', 'employeeId', 'username', 'role'],
    });
    return NextResponse.json({ success: true, user: responseUser }, { status: 201 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to create user' }, { status: 500 });
  }
}
