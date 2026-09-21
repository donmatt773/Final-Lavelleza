import { v2 as cloudinary } from 'cloudinary';

const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
};

function getCloudinary() {
  if (!cloudinaryConfig.cloud_name || !cloudinaryConfig.api_key || !cloudinaryConfig.api_secret) {
    throw new Error('Cloudinary environment variables are not configured.');
  }

  cloudinary.config(cloudinaryConfig);
  return cloudinary;
}

export async function uploadRoomImage(buffer: Buffer, originalFilename: string) {
  const client = getCloudinary();
  const publicId = originalFilename.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'room-image';

  return new Promise<{ secureUrl: string; publicId: string }>((resolve, reject) => {
    const upload = client.uploader.upload_stream(
      {
        folder: 'la-velleza/rooms',
        public_id: `${Date.now()}-${publicId}`,
        resource_type: 'image',
        overwrite: false,
      },
      (error, result) => {
        if (error || !result?.secure_url || !result.public_id) {
          reject(error || new Error('Cloudinary did not return an uploaded image.'));
          return;
        }

        resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      },
    );

    upload.end(buffer);
  });
}