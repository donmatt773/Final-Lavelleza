export type UploadedImage = { fileUrl: string; storageKey: string; altText: string };

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Uploads directly from the browser to Cloudinary using a short-lived signature from
// our API. This keeps large image bytes off our serverless function, which otherwise
// rejects big request bodies with FUNCTION_PAYLOAD_TOO_LARGE.
export async function uploadImagesToCloudinary(
  files: File[],
  authHeaders: Record<string, string>,
): Promise<UploadedImage[]> {
  const sigRes = await fetch('/api/uploads', { headers: authHeaders, credentials: 'same-origin' });
  const sigData = await sigRes.json().catch(() => null);

  if (!sigRes.ok || !sigData?.success) {
    throw new Error(sigData?.message || 'Unable to prepare upload.');
  }

  const { signature, timestamp, apiKey, cloudName, folder } = sigData as {
    signature: string;
    timestamp: number;
    apiKey?: string;
    cloudName?: string;
    folder: string;
  };

  if (!apiKey || !cloudName) {
    throw new Error('Image uploads are not configured.');
  }

  const uploaded: UploadedImage[] = [];

  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      throw new Error(`${file.name} is not a supported image file.`);
    }

    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`${file.name} is larger than the 10 MB upload limit.`);
    }

    const data = new FormData();
    data.append('file', file);
    data.append('api_key', apiKey);
    data.append('timestamp', String(timestamp));
    data.append('signature', signature);
    data.append('folder', folder);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: data,
    });

    const result = await res.json().catch(() => null);
    if (!res.ok || !result?.secure_url || !result?.public_id) {
      throw new Error(result?.error?.message || `Unable to upload ${file.name}.`);
    }

    uploaded.push({ fileUrl: result.secure_url, storageKey: result.public_id, altText: file.name });
  }

  return uploaded;
}
