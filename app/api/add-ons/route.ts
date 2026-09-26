import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import AddOn from '@/app/lib/AddOn';
import { getAddOnAvailability } from '@/app/lib/addOnAvailability';
import { requireOwner } from '@/app/lib/auth';
import { triggerDashboardUpdate } from '@/app/lib/pusher-server';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function GET(request: Request) {
  try {
    await connectDB();
    const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';
    if (includeInactive) {
      const authError = requireOwner(request);
      if (authError) return authError;
    }
    const { searchParams } = new URL(request.url);
    const checkInRaw = searchParams.get('checkIn');
    const checkOutRaw = searchParams.get('checkOut');
    let checkIn: Date | undefined;
    let checkOut: Date | undefined;
    if (checkInRaw || checkOutRaw) {
      checkIn = checkInRaw ? new Date(checkInRaw) : undefined;
      checkOut = checkOutRaw ? new Date(checkOutRaw) : undefined;
      if (!checkIn || !checkOut || Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
        return NextResponse.json({ success: false, message: 'Valid check-in and check-out dates are required for stock availability.' }, { status: 400 });
      }
    }
    const query = includeInactive ? {} : { isActive: true };
    const addOns = await AddOn.find(query).sort({ category: 1, name: 1 }).lean();
    const availability = await getAddOnAvailability({ addOns, checkIn, checkOut });
    return NextResponse.json(addOns.map((addOn) => ({
      ...addOn,
      availableQuantity: availability.get(String(addOn._id)),
    })), { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load add-ons.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;
    await connectDB();
    const body = await request.json().catch(() => null);
    if (!isRecord(body)) return NextResponse.json({ success: false, message: 'Request body must be a JSON object.' }, { status: 400 });

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const price = Number(body.price);
    const stockQuantity = body.stockQuantity === null || body.stockQuantity === undefined || body.stockQuantity === '' ? null : Number(body.stockQuantity);
    if (!name || !Number.isFinite(price) || price < 0 || (stockQuantity !== null && (!Number.isInteger(stockQuantity) || stockQuantity < 0))) {
      return NextResponse.json({ success: false, message: 'Name, price, and optional stock quantity are invalid.' }, { status: 400 });
    }

    const addOn = await AddOn.create({
      name,
      description: typeof body.description === 'string' ? body.description.trim() : undefined,
      category: typeof body.category === 'string' && body.category.trim() ? body.category.trim().toUpperCase() : 'OTHER',
      price,
      isActive: body.isActive !== false,
      stockQuantity,
    });
    await triggerDashboardUpdate('dashboard-updated', { type: 'add-on-created', addOnId: String(addOn._id) });
    return NextResponse.json({ success: true, addOn }, { status: 201 });
  } catch (error: unknown) {
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ success: false, message: 'An add-on with this name already exists.' }, { status: 409 });
    return NextResponse.json({ success: false, message: 'Failed to create add-on.' }, { status: 500 });
  }
}
