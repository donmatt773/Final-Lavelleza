import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/app/lib/db';
import { evaluatePromosForReservation } from '@/app/lib/promoEligibility';

export async function GET(request: Request) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const roomId = (searchParams.get('room') || '').trim();
    const checkInRaw = (searchParams.get('checkIn') || '').trim();
    const checkOutRaw = (searchParams.get('checkOut') || '').trim();

    if (!roomId || !checkInRaw || !checkOutRaw) {
      return NextResponse.json({ success: true, eligiblePromos: [], validPromos: [], expiredPromos: [], inactivePromos: [], summary: { validPromos: 0, expiredPromos: 0, inactivePromos: 0, eligiblePromos: 0 } }, { status: 200 });
    }

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return NextResponse.json({ success: false, message: 'Room must be a valid room ID.' }, { status: 400 });
    }

    const checkIn = new Date(checkInRaw);
    const checkOut = new Date(checkOutRaw);

    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
      return NextResponse.json({ success: false, message: 'Check-in and check-out must be valid dates.' }, { status: 400 });
    }

    if (checkOut <= checkIn) {
      return NextResponse.json({ success: false, message: 'Check-out date must be later than check-in date.' }, { status: 400 });
    }

    const catalog = await evaluatePromosForReservation({ roomId, checkIn, checkOut });

    return NextResponse.json(
      {
        success: true,
        eligiblePromos: catalog.eligiblePromos,
        validPromos: catalog.validPromos,
        expiredPromos: catalog.expiredPromos,
        inactivePromos: catalog.inactivePromos,
        summary: {
          validPromos: catalog.validPromos.length,
          expiredPromos: catalog.expiredPromos.length,
          inactivePromos: catalog.inactivePromos.length,
          eligiblePromos: catalog.eligiblePromos.length,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to evaluate promo eligibility.' }, { status: 500 });
  }
}
