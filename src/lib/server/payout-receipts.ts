import { createHash } from 'node:crypto';

/**
 * Proof-of-payment receipts for affiliate payouts. The image is stored in Cloudinary as an
 * "authenticated" asset, so its plain Cloudinary link does not open; it is only served through
 * /api/payouts/[id]/receipt, which checks the viewer. The payout ledger row keeps a small
 * reference in metadata.receipt; no bytes or bank details are stored in the database.
 */

const CLOUDINARY_API_BASE = (
	process.env.CLOUDINARY_UPLOAD_PREFIX || 'https://api.cloudinary.com'
).replace(/\/+$/, '');
const RECEIPT_FOLDER = 'payout-receipts';
export const RECEIPT_MAX_BYTES = 5 * 1024 * 1024;
export const RECEIPT_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface PayoutReceipt {
	publicId: string;
	format: string;
	bytes: number | null;
	uploadedAt: string;
	uploadedBy: string | null;
}

interface CloudinaryConfig {
	cloudName: string;
	apiKey: string;
	apiSecret: string;
}

function cloudinaryConfig(): CloudinaryConfig | null {
	const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
	const apiKey = process.env.CLOUDINARY_API_KEY;
	const apiSecret = process.env.CLOUDINARY_API_SECRET;
	return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
}

/** Cloudinary API signature: SHA-1 of the sorted parameters joined with "&", then the secret. */
export function signCloudinaryParams(params: Record<string, string>, apiSecret: string): string {
	const toSign = Object.keys(params)
		.sort()
		.map((key) => `${key}=${params[key]}`)
		.join('&');
	return createHash('sha1')
		.update(toSign + apiSecret)
		.digest('hex');
}

export function receiptFromMetadata(metadata: unknown): PayoutReceipt | null {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	const receipt = (metadata as Record<string, unknown>).receipt;
	if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return null;
	const row = receipt as Record<string, unknown>;
	if (typeof row.publicId !== 'string' || typeof row.format !== 'string') return null;
	return {
		publicId: row.publicId,
		format: row.format,
		bytes: typeof row.bytes === 'number' ? row.bytes : null,
		uploadedAt: typeof row.uploadedAt === 'string' ? row.uploadedAt : '',
		uploadedBy: typeof row.uploadedBy === 'string' ? row.uploadedBy : null
	};
}

export async function uploadPayoutReceipt(file: File, uploadedBy: string): Promise<PayoutReceipt> {
	const config = cloudinaryConfig();
	if (!config) throw new Error('RECEIPT_STORAGE_NOT_CONFIGURED');
	const payload = new FormData();
	payload.append('file', file);
	payload.append('public_id', `${RECEIPT_FOLDER}/${crypto.randomUUID()}`);
	payload.append('type', 'authenticated');
	payload.append('overwrite', 'false');
	payload.append('tags', 'payout_receipt');
	const response = await fetch(`${CLOUDINARY_API_BASE}/v1_1/${config.cloudName}/image/upload`, {
		method: 'POST',
		headers: {
			authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString('base64')}`
		},
		body: payload
	});
	const result = (await response.json().catch(() => null)) as {
		public_id?: string;
		format?: string;
		bytes?: number;
		error?: { message?: string };
	} | null;
	if (!response.ok || !result?.public_id || !result.format) {
		throw new Error(result?.error?.message || 'RECEIPT_UPLOAD_FAILED');
	}
	return {
		publicId: result.public_id,
		format: result.format,
		bytes: typeof result.bytes === 'number' ? result.bytes : null,
		uploadedAt: new Date().toISOString(),
		uploadedBy
	};
}

/** A short-lived signed link that downloads the private image from Cloudinary (server side only). */
export function privateReceiptDownloadUrl(receipt: PayoutReceipt, now = Date.now()): string | null {
	const config = cloudinaryConfig();
	if (!config) return null;
	const params: Record<string, string> = {
		expires_at: String(Math.floor(now / 1000) + 300),
		format: receipt.format,
		public_id: receipt.publicId,
		timestamp: String(Math.floor(now / 1000)),
		type: 'authenticated'
	};
	const query = new URLSearchParams({
		...params,
		api_key: config.apiKey,
		signature: signCloudinaryParams(params, config.apiSecret)
	});
	return `${CLOUDINARY_API_BASE}/v1_1/${config.cloudName}/image/download?${query}`;
}

const FORMAT_CONTENT_TYPES: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp'
};

export function receiptContentType(receipt: PayoutReceipt): string {
	return FORMAT_CONTENT_TYPES[receipt.format.toLowerCase()] ?? 'application/octet-stream';
}
