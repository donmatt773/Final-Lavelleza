import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import AddOn from '@/app/lib/AddOn';
import { requireOwner } from '@/app/lib/auth';
import { triggerDashboardUpdate } from '@/app/lib/pusher-server';
import { AddOnInventoryBusyError, withAddOnInventoryLock } from '@/app/lib/addOnAvailability';
import { diffAuditFields, writeAuditLog } from '@/app/lib/auditLogWriter';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: 'Invalid add-on ID.' }, { status: 400 });
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = typeof body.name === 'string' ? body.name.trim() : '';
    if (body.description !== undefined) update.description = typeof body.description === 'string' ? body.description.trim() : '';
    if (body.category !== undefined) update.category = typeof body.category === 'string' ? body.category.trim().toUpperCase() : 'OTHER';
    if (body.price !== undefined) update.price = Number(body.price);
    if (body.isActive !== undefined) update.isActive = body.isActive === true;
    if (body.stockQuantity !== undefined) update.stockQuantity = body.stockQuantity === null || body.stockQuantity === '' ? null : Number(body.stockQuantity);

    if (update.name === '' || (update.price !== undefined && (!Number.isFinite(update.price as number) || (update.price as number) < 0)) || (update.stockQuantity !== undefined && update.stockQuantity !== null && (!Number.isInteger(update.stockQuantity as number) || (update.stockQuantity as number) < 0))) {
      return NextResponse.json({ success: false, message: 'Add-on values are invalid.' }, { status: 400 });
    }

    let previousAddOn: Record<string, unknown> | null = null;
    const addOn = await withAddOnInventoryLock([id], async () => {
      previousAddOn = await AddOn.findById(id).lean() as Record<string, unknown> | null;
      return AddOn.findByIdAndUpdate(id, update, { new: true, runValidators: true });
    });
    if (!addOn) return NextResponse.json({ success: false, message: 'Add-on not found.' }, { status: 404 });
    await writeAuditLog(request, {
      action: 'UPDATE',
      entityType: 'ADD_ON',
      entityId: String(addOn._id),
      entityLabel: addOn.name,
      summary: 'Updated a reservation add-on.',
      changedFields: diffAuditFields(previousAddOn, addOn, Object.keys(update)),
    });
    await triggerDashboardUpdate('dashboard-updated', { type: 'add-on-updated', addOnId: String(addOn._id) });
    return NextResponse.json({ success: true, addOn }, { status: 200 });
  } catch (error: unknown) {
    if (error instanceof AddOnInventoryBusyError) return NextResponse.json({ success: false, message: error.message }, { status: 409 });
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ success: false, message: 'An add-on with this name already exists.' }, { status: 409 });
    return NextResponse.json({ success: false, message: 'Failed to update add-on.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) return NextResponse.json({ success: false, message: 'Invalid add-on ID.' }, { status: 400 });
    const addOn = await AddOn.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!addOn) return NextResponse.json({ success: false, message: 'Add-on not found.' }, { status: 404 });
    await writeAuditLog(request, {
      action: 'DEACTIVATE',
      entityType: 'ADD_ON',
      entityId: String(addOn._id),
      entityLabel: addOn.name,
      summary: 'Deactivated a reservation add-on.',
      changedFields: ['isActive'],
    });
    await triggerDashboardUpdate('dashboard-updated', { type: 'add-on-archived', addOnId: String(addOn._id) });
    return NextResponse.json({ success: true, addOn }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to archive add-on.' }, { status: 500 });
  }
}
