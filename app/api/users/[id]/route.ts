import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import User from '@/app/lib/User';
import { hashPassword } from '@/app/lib/password';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json();

    const updatePayload: Record<string, unknown> = {};
    if (body.employeeId !== undefined) updatePayload.employeeId = String(body.employeeId).toUpperCase();
    if (body.username !== undefined) updatePayload.username = String(body.username).toLowerCase();
    if (body.name !== undefined) updatePayload.name = body.name;
    if (body.role !== undefined) updatePayload.role = Number(body.role ?? 1);

    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || !body.password.trim()) {
        return NextResponse.json({ success: false, message: 'Password must be a non-empty string.' }, { status: 400 });
      }
      updatePayload.password = await hashPassword(body.password);
    }

    const updated = await User.findByIdAndUpdate(
      id,
      updatePayload,
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const { password: _password, ...responseUser } = updated.toObject();
    return NextResponse.json({ success: true, user: responseUser });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await connectDB();
    const { id } = await params;
    const deleted = await User.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to delete user' }, { status: 500 });
  }
}
