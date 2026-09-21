import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import AddOn from '@/app/lib/AddOn';
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
    const query = includeInactive ? {} : { isActive: true };
    const addOns = await AddOn.find(query).sort({ category: 1, name: 1 }).lean();
    return NextResponse.json(addOns, { status: 200 });
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
    if (!name || !Number.isFinite(price) || price < 0 || (stockQuantity !== null && (!Number.isFinite(stockQuantity) || stockQuantity < 0))) {
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
