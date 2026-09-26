const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

type UploadSignature = {
  success: boolean;
  signature: string;
  timestamp: number;
  apiKey?: string;
  cloudName?: string;
  folder: string;
  message?: string;
};

export function extractGcashReferenceNumber(text: string) {
  const normalized = text
    .replace(/[\u00a0]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[ \t]+/g, ' ');
  const referenceLabel = /\b(?:ref(?:erence)?|transaction)\s*(?:(?:no|number|id)\.?\s*)?[:#-]?\s*/gi;
  let labelMatch: RegExpExecArray | null;

  while ((labelMatch = referenceLabel.exec(normalized))) {
    const nearbyText = normalized.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 48);
    const groupedDigits = nearbyText.match(/^\s*([0-9][0-9\s-]{6,24})/);
    if (!groupedDigits?.[1]) continue;

    const digits = groupedDigits[1].replace(/\D/g, '');
    if (digits.length >= 8 && digits.length <= 20) return digits;
  }

  const standaloneThirteenDigitReference = normalized.match(/(?:^|\D)(\d(?:[\s-]?\d){12})(?:\D|$)/m);
  return standaloneThirteenDigitReference?.[1]?.replace(/\D/g, '') || null;
}

export function extractGcashAmount(text: string) {
  const normalized = text
    .replace(/[\u00a0]/g, ' ')
    .replace(/[|]/g, ' ')
    .replace(/[ \t]+/g, ' ');
  const parseLabeledAmount = (label: RegExp) => {
    const match = label.exec(normalized);
    if (!match?.[1]) return null;
    const amount = Number(match[1].replace(/,/g, ''));
    return Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : null;
  };

  const totalSent = parseLabeledAmount(/\btotal\s+amount\s+sent\s*[:#-]?\s*(?:₱|PHP)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (totalSent) return totalSent;

  const amount = parseLabeledAmount(/\bamount\s*[:#-]?\s*(?:₱|PHP)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (amount) return amount;

  const currencyAmount = parseLabeledAmount(/(?:₱|PHP)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (currencyAmount) return currencyAmount;

  return null;
}

export async function uploadPaymentReceipt(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP receipt image.');
  }
  if (file.size > MAX_RECEIPT_SIZE) throw new Error('Receipt image must be 10 MB or smaller.');

  const signatureResponse = await fetch('/api/uploads/payment-proof', { credentials: 'same-origin', cache: 'no-store' });
  const signatureData = await signatureResponse.json().catch(() => null) as UploadSignature | null;
  if (!signatureResponse.ok || !signatureData?.success) {
    throw new Error(signatureData?.message || 'Unable to prepare receipt upload.');
  }
  if (!signatureData.apiKey || !signatureData.cloudName) throw new Error('Receipt uploads are not configured.');

  const payload = new FormData();
  payload.append('file', file);
  payload.append('api_key', signatureData.apiKey);
  payload.append('timestamp', String(signatureData.timestamp));
  payload.append('signature', signatureData.signature);
  payload.append('folder', signatureData.folder);

  const cloudinaryResponse = await fetch(`https://api.cloudinary.com/v1_1/${signatureData.cloudName}/image/upload`, {
    method: 'POST',
    body: payload,
  });
  const cloudinaryData = await cloudinaryResponse.json().catch(() => null);
  if (!cloudinaryResponse.ok || typeof cloudinaryData?.secure_url !== 'string') {
    throw new Error(cloudinaryData?.error?.message || 'Unable to upload receipt image.');
  }

  return String(cloudinaryData.secure_url);
}

export async function readGcashReceiptDetails(file: File, onProgress?: (progress: number) => void) {
  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (message) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') onProgress?.(message.progress);
    },
  });

  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const result = await worker.recognize(file);
    const text = result.data.text || '';
    return {
      referenceNumber: extractGcashReferenceNumber(text),
      amount: extractGcashAmount(text),
    };
  } finally {
    await worker.terminate();
  }
}