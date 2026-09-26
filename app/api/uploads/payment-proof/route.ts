import { NextResponse } from 'next/server';
import { requireOwnerOrStaff } from '@/app/lib/auth';
import { createUploadSignature } from '@/app/lib/cloudinary';

export async function GET(request: Request) {
  const authError = requireOwnerOrStaff(request);
  if (authError) return authError;

  try {
    return NextResponse.json({
      success: true,
      ...createUploadSignature('la-velleza/payment-proofs'),
    }, { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to prepare receipt upload.' }, { status: 500 });
  }
}