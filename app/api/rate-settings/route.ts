import { NextResponse } from 'next/server';
import { connectDB } from '@/app/lib/db';
import RateSettings from '@/app/lib/RateSettings';
import { requireOwner } from '@/app/lib/auth';

const DEFAULT_RATE_SETTINGS = {
  key: 'default',
  checkInTime: '1:00 PM',
  checkOutTime: '11:00 AM',
  extraPersonRate: 150,
  childExemptionAge: 9,
  extraSingleBedRate: 300,
  extraDoubleBedRate: 500,
  halfDayCutoffTime: '6:00 PM',
  beforeCutoffRateType: 'HALF_DAY',
  afterCutoffRateType: 'WHOLE_DAY',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidTime(value: unknown) {
  return typeof value === 'string' && /^(1[0-2]|[1-9]):[0-5][0-9]\s?(AM|PM)$/i.test(value.trim());
}

function validatePayload(body: unknown) {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return ['Request body must be a JSON object.'];
  }

  if (!isValidTime(body.checkInTime)) {
    errors.push('Check-in time must follow h:mm AM/PM format.');
  }

  if (!isValidTime(body.checkOutTime)) {
    errors.push('Check-out time must follow h:mm AM/PM format.');
  }

  if (typeof body.extraPersonRate !== 'number' || !Number.isFinite(body.extraPersonRate) || body.extraPersonRate < 0) {
    errors.push('Extra person rate must be a non-negative number.');
  }

  if (typeof body.childExemptionAge !== 'number' || !Number.isFinite(body.childExemptionAge) || body.childExemptionAge < 0) {
    errors.push('Child exemption age must be a non-negative number.');
  }

  if (typeof body.extraSingleBedRate !== 'number' || !Number.isFinite(body.extraSingleBedRate) || body.extraSingleBedRate < 0) {
    errors.push('Extra single bed rate must be a non-negative number.');
  }

  if (typeof body.extraDoubleBedRate !== 'number' || !Number.isFinite(body.extraDoubleBedRate) || body.extraDoubleBedRate < 0) {
    errors.push('Extra double bed rate must be a non-negative number.');
  }

  if (!isValidTime(body.halfDayCutoffTime)) {
    errors.push('Half-day cutoff time must follow h:mm AM/PM format.');
  }

  if (body.beforeCutoffRateType !== 'HALF_DAY') {
    errors.push('Before cutoff rate type must be HALF_DAY.');
  }

  if (body.afterCutoffRateType !== 'WHOLE_DAY') {
    errors.push('After cutoff rate type must be WHOLE_DAY.');
  }

  return errors;
}

export async function GET(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();

    const existing = await RateSettings.findOne({ key: 'default' }).lean();
    const settings = existing
      ? { ...DEFAULT_RATE_SETTINGS, ...existing }
      : { ...DEFAULT_RATE_SETTINGS };

    return NextResponse.json({ success: true, settings }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to load rate settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    await connectDB();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body.' }, { status: 400 });
    }

    const errors = validatePayload(body);
    if (errors.length > 0) {
      return NextResponse.json({ success: false, message: 'Invalid settings payload.', errors }, { status: 400 });
    }

    const input = body as {
  checkInTime: string;
  checkOutTime: string;
  extraPersonRate: number;
  childExemptionAge: number;
  extraSingleBedRate: number;
  extraDoubleBedRate: number;
  halfDayCutoffTime: string;
};

    const payload = {
      key: 'default',
      checkInTime: input.checkInTime.trim().toUpperCase(),
      checkOutTime: input.checkOutTime.trim().toUpperCase(),
      extraPersonRate: input.extraPersonRate,
      childExemptionAge: input.childExemptionAge,
      extraSingleBedRate: input.extraSingleBedRate,
      extraDoubleBedRate: input.extraDoubleBedRate,
      halfDayCutoffTime: input.halfDayCutoffTime.trim().toUpperCase(),
      beforeCutoffRateType: 'HALF_DAY',
      afterCutoffRateType: 'WHOLE_DAY',
    };

    const updated = await RateSettings.findOneAndUpdate(
      { key: 'default' },
      payload,
      { returnDocument: 'after', upsert: true, runValidators: true }
    ).lean();

    return NextResponse.json({ success: true, settings: updated }, { status: 200 });
  } catch (error: unknown) {
    const errorWithDetails = error as { name?: unknown; message?: string };

    if (errorWithDetails.name === 'ValidationError') {
      return NextResponse.json({ success: false, message: 'Validation failed.', errors: errorWithDetails.message }, { status: 400 });
    }

    return NextResponse.json({ success: false, message: 'Failed to save rate settings.' }, { status: 500 });
  }
}
