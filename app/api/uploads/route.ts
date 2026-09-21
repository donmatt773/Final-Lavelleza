import { NextResponse } from 'next/server';
import { requireOwner } from '@/app/lib/auth';
import { uploadRoomImage } from '@/app/lib/cloudinary';

export const runtime = 'nodejs';

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

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

    const uploadedImages = [] as Array<{ fileUrl: string; storageKey: string; altText: string }>;

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ success: false, message: `${file.name} is not a supported image file.` }, { status: 400 });
      }

      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ success: false, message: `${file.name} is larger than the 4 MB upload limit.` }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadedImage = await uploadRoomImage(buffer, file.name);

      uploadedImages.push({
        fileUrl: uploadedImage.secureUrl,
        storageKey: uploadedImage.publicId,
        altText: file.name,
      });
    }

    return NextResponse.json({ success: true, images: uploadedImages }, { status: 200 });
  } catch {
    return NextResponse.json({ success: false, message: 'Failed to upload room images.' }, { status: 500 });
  }
}
