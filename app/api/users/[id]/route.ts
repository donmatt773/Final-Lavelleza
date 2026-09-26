import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import User from '@/app/lib/User';
import { hashPassword } from '@/app/lib/password';
import { requireOwner } from '@/app/lib/auth';
import { writeAuditLog } from '@/app/lib/auditLogWriter';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;
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
    await writeAuditLog(request, {
      action: 'UPDATE',
      entityType: 'USER',
      entityId: String(updated._id),
      entityLabel: `${updated.name} (${updated.employeeId})`,
      summary: 'Updated a staff account.',
      changedFields: Object.keys(updatePayload),
    });
    return NextResponse.json({ success: true, user: responseUser });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;
    await connectDB();
    const { id } = await params;
    const deleted = await User.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    await writeAuditLog(request, {
      action: 'DELETE',
      entityType: 'USER',
      entityId: String(deleted._id),
      entityLabel: `${deleted.name} (${deleted.employeeId})`,
      summary: 'Deleted a staff account.',
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to delete user' }, { status: 500 });
  }
}
