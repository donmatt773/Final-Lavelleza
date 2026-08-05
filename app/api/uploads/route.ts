import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { requireOwner } from '@/app/lib/auth';

function isFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File;
}

export async function POST(request: Request) {
  try {
    const authError = requireOwner(request);
    if (authError) return authError;

    const formData = await request.formData();
    const files = formData.getAll('files').filter(isFile);

    if (!files.length) {
      return NextResponse.json({ success: false, message: 'No files were provided.' }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'rooms');
    await fs.mkdir(uploadsDir, { recursive: true });

    const uploadedImages = [] as Array<{ fileUrl: string; storageKey: string; altText: string }>;

    for (const file of files) {
      const safeName = `${Date.now()}-${randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const filePath = path.join(uploadsDir, safeName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      uploadedImages.push({
        fileUrl: `/uploads/rooms/${safeName}`,
        storageKey: safeName,
        altText: file.name,
      });
    }

    return NextResponse.json({ success: true, images: uploadedImages }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to upload room images.' }, { status: 500 });
  }
}
