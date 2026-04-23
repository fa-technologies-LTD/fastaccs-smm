import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const CLOUDINARY_UPLOAD_BASE_URL =
	process.env.CLOUDINARY_UPLOAD_PREFIX || 'https://api.cloudinary.com';
const CLOUDINARY_UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || 'tier-samples';
const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface CloudinaryUploadResult {
	secure_url?: string;
	public_id?: string;
	asset_id?: string;
	bytes?: number;
	width?: number;
	height?: number;
	format?: string;
	error?: { message?: string };
}

function sanitizeFilename(name: string): string {
	const withoutExtension = name.replace(/\.[^/.]+$/, '');
	const sanitized = withoutExtension
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);

	return sanitized || 'sample-screenshot';
}

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		if (!locals.user || locals.user.userType !== 'ADMIN') {
			return json({ success: false, error: 'Unauthorized' }, { status: 401 });
		}

		const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
		const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
		const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

		if (!cloudinaryCloudName || !cloudinaryApiKey || !cloudinaryApiSecret) {
			return json(
				{
					success: false,
					error:
						'Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
				},
				{ status: 500 }
			);
		}

		const incomingFormData = await request.formData();
		const file = incomingFormData.get('file');

		if (!(file instanceof File)) {
			return json({ success: false, error: 'No file provided' }, { status: 400 });
		}

		if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
			return json(
				{
					success: false,
					error: 'Unsupported file type. Use JPG, PNG, or WEBP.'
				},
				{ status: 400 }
			);
		}

		if (file.size <= 0) {
			return json({ success: false, error: 'File is empty' }, { status: 400 });
		}

		if (file.size > MAX_FILE_SIZE_BYTES) {
			return json(
				{
					success: false,
					error: 'File is too large. Maximum allowed size is 3MB.'
				},
				{ status: 400 }
			);
		}

		const safeName = sanitizeFilename(file.name);
		const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
		const publicId = `${datePrefix}-${crypto.randomUUID()}-${safeName}`
			.toLowerCase()
			.replace(/[^a-z0-9-_.]+/g, '-')
			.slice(0, 240);

		const uploadBase = CLOUDINARY_UPLOAD_BASE_URL.replace(/\/+$/, '');
		const uploadUrl = `${uploadBase}/v1_1/${cloudinaryCloudName}/image/upload`;
		const uploadPayload = new FormData();
		uploadPayload.append('file', file);
		uploadPayload.append('folder', CLOUDINARY_UPLOAD_FOLDER);
		uploadPayload.append('public_id', publicId);
		uploadPayload.append('use_filename', 'false');
		uploadPayload.append('unique_filename', 'false');
		uploadPayload.append('overwrite', 'false');
		uploadPayload.append('tags', 'tier_sample_screenshot');

		const basicAuthToken = Buffer.from(`${cloudinaryApiKey}:${cloudinaryApiSecret}`).toString(
			'base64'
		);
		const uploadResponse = await fetch(uploadUrl, {
			method: 'POST',
			headers: {
				authorization: `Basic ${basicAuthToken}`
			},
			body: uploadPayload
		});

		const uploadResult = (await uploadResponse
			.json()
			.catch(() => null)) as CloudinaryUploadResult | null;
		if (!uploadResponse.ok || !uploadResult?.secure_url) {
			const fallbackError = uploadResult?.error?.message || 'Cloudinary upload failed';

			return json(
				{ success: false, error: fallbackError },
				{ status: uploadResponse.status || 500 }
			);
		}

		return json({
			success: true,
			data: {
				url: uploadResult.secure_url,
				publicId: uploadResult.public_id,
				assetId: uploadResult.asset_id,
				width: uploadResult.width,
				height: uploadResult.height,
				bytes: uploadResult.bytes,
				format: uploadResult.format
			}
		});
	} catch (error) {
		console.error('Tier screenshot upload failed:', error);
		return json({ success: false, error: 'Failed to upload screenshot' }, { status: 500 });
	}
};
