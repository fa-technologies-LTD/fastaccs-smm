import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { getTierExactPreviewConfig } from '$lib/helpers/tier-exact-preview';
import {
	getExactPreviewProfileUrl,
	getExactPreviewScreenshotUrl
} from '$lib/services/exact-preview';

const CLOUDINARY_UPLOAD_BASE_URL =
	process.env.CLOUDINARY_UPLOAD_PREFIX || 'https://api.cloudinary.com';
const CLOUDINARY_UPLOAD_FOLDER =
	process.env.CLOUDINARY_EXACT_PREVIEW_FOLDER || 'exact-preview-thumbnails';
const CAPTURE_TIMEOUT_MS = 20_000;
const RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MAX_CAPTURE_BYTES = 6 * 1024 * 1024;
const CAPTURE_CONCURRENCY = 3;

const THUMBNAIL_URL_KEY = 'exact_preview_screenshot';
const THUMBNAIL_GENERATED_AT_KEY = 'exact_preview_thumbnail_generated_at';
const THUMBNAIL_ATTEMPTED_AT_KEY = 'exact_preview_thumbnail_attempted_at';
const THUMBNAIL_ERROR_KEY = 'exact_preview_thumbnail_error';

interface ExactPreviewThumbnailSummary {
	scanned: number;
	generated: number;
	failed: number;
	skipped: number;
	reason?: string;
}

interface CloudinaryUploadResult {
	secure_url?: string;
	error?: { message?: string };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toJsonInput(value: Record<string, unknown>): Prisma.InputJsonObject {
	return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

function getCloudinaryConfig(): {
	cloudName: string;
	apiKey: string;
	apiSecret: string;
} | null {
	const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
	const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
	const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
	if (!cloudName || !apiKey || !apiSecret) return null;
	return { cloudName, apiKey, apiSecret };
}

function getBackgroundCaptureUrl(profileUrl: string): string {
	return `https://s.wordpress.com/mshots/v1/${encodeURIComponent(profileUrl)}?w=960`;
}

function wasRecentlyAttempted(extras: Record<string, unknown>, now: Date): boolean {
	const raw = extras[THUMBNAIL_ATTEMPTED_AT_KEY];
	if (typeof raw !== 'string') return false;
	const timestamp = Date.parse(raw);
	return Number.isFinite(timestamp) && now.getTime() - timestamp < RETRY_COOLDOWN_MS;
}

async function fetchCapture(profileUrl: string): Promise<Blob> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
	try {
		const response = await fetch(getBackgroundCaptureUrl(profileUrl), {
			headers: {
				'user-agent': 'FastAccs exact-preview thumbnail worker'
			},
			signal: controller.signal
		});
		if (!response.ok) {
			throw new Error(`Screenshot capture returned HTTP ${response.status}`);
		}

		const contentType = String(response.headers.get('content-type') || '').toLowerCase();
		if (!contentType.startsWith('image/')) {
			throw new Error('Screenshot capture did not return an image');
		}

		const blob = await response.blob();
		if (blob.size <= 0 || blob.size > MAX_CAPTURE_BYTES) {
			throw new Error('Screenshot capture returned an invalid image size');
		}
		return blob;
	} finally {
		clearTimeout(timeout);
	}
}

async function uploadCaptureToCloudinary(input: {
	accountId: string;
	blob: Blob;
	config: NonNullable<ReturnType<typeof getCloudinaryConfig>>;
}): Promise<string> {
	const uploadBase = CLOUDINARY_UPLOAD_BASE_URL.replace(/\/+$/, '');
	const uploadUrl = `${uploadBase}/v1_1/${input.config.cloudName}/image/upload`;
	const uploadPayload = new FormData();
	uploadPayload.append('file', input.blob, `${input.accountId}.png`);
	uploadPayload.append('folder', CLOUDINARY_UPLOAD_FOLDER);
	uploadPayload.append('public_id', `${input.accountId}-${randomUUID()}`);
	uploadPayload.append('overwrite', 'false');
	uploadPayload.append('tags', 'exact_preview_thumbnail');

	const basicAuthToken = Buffer.from(`${input.config.apiKey}:${input.config.apiSecret}`).toString(
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
		throw new Error(uploadResult?.error?.message || 'Cloudinary thumbnail upload failed');
	}
	return uploadResult.secure_url;
}

async function recordAttempt(input: {
	accountId: string;
	extras: Record<string, unknown>;
	now: Date;
	url?: string;
	error?: unknown;
}): Promise<void> {
	const nextExtras: Record<string, unknown> = {
		...input.extras,
		[THUMBNAIL_ATTEMPTED_AT_KEY]: input.now.toISOString()
	};

	if (input.url) {
		nextExtras[THUMBNAIL_URL_KEY] = input.url;
		nextExtras[THUMBNAIL_GENERATED_AT_KEY] = input.now.toISOString();
		delete nextExtras[THUMBNAIL_ERROR_KEY];
	} else {
		nextExtras[THUMBNAIL_ERROR_KEY] = String(
			input.error instanceof Error ? input.error.message : input.error || 'Unknown capture error'
		).slice(0, 240);
	}

	await prisma.account.update({
		where: { id: input.accountId },
		data: {
			credentialExtras: toJsonInput(nextExtras),
			updatedAt: new Date()
		}
	});
}

export async function generateMissingExactPreviewThumbnails(
	options: {
		tierId?: string;
		limit?: number;
		force?: boolean;
	} = {}
): Promise<ExactPreviewThumbnailSummary> {
	const config = getCloudinaryConfig();
	if (!config) {
		return {
			scanned: 0,
			generated: 0,
			failed: 0,
			skipped: 0,
			reason: 'cloudinary_not_configured'
		};
	}

	const limit = Math.min(Math.max(Number(options.limit || 12), 1), 50);
	const now = new Date();
	const accounts = await prisma.account.findMany({
		where: {
			...(options.tierId ? { categoryId: options.tierId } : {}),
			status: { in: ['available', 'reserved'] },
			category: {
				categoryType: 'tier',
				isActive: true
			}
		},
		select: {
			id: true,
			linkUrl: true,
			credentialExtras: true,
			category: {
				select: {
					metadata: true
				}
			}
		},
		orderBy: [{ updatedAt: 'asc' }, { createdAt: 'asc' }],
		take: Math.min(Math.max(limit * 50, 200), 1000)
	});

	const summary: ExactPreviewThumbnailSummary = {
		scanned: accounts.length,
		generated: 0,
		failed: 0,
		skipped: 0
	};
	const candidates: Array<{
		accountId: string;
		extras: Record<string, unknown>;
		profileUrl: string;
	}> = [];

	for (const account of accounts) {
		if (candidates.length >= limit) break;
		if (!getTierExactPreviewConfig(account.category.metadata).enabled) {
			summary.skipped += 1;
			continue;
		}

		const extras = isObject(account.credentialExtras) ? account.credentialExtras : {};
		if (getExactPreviewScreenshotUrl(account)) {
			summary.skipped += 1;
			continue;
		}
		if (!options.force && wasRecentlyAttempted(extras, now)) {
			summary.skipped += 1;
			continue;
		}

		const profileUrl = getExactPreviewProfileUrl(account);
		if (!profileUrl) {
			summary.skipped += 1;
			continue;
		}

		candidates.push({ accountId: account.id, extras, profileUrl });
	}

	for (let index = 0; index < candidates.length; index += CAPTURE_CONCURRENCY) {
		await Promise.all(
			candidates.slice(index, index + CAPTURE_CONCURRENCY).map(async (candidate) => {
				try {
					const blob = await fetchCapture(candidate.profileUrl);
					const url = await uploadCaptureToCloudinary({
						accountId: candidate.accountId,
						blob,
						config
					});
					await recordAttempt({
						accountId: candidate.accountId,
						extras: candidate.extras,
						now: new Date(),
						url
					});
					summary.generated += 1;
				} catch (error) {
					console.error('[exact-preview.thumbnail.failed]', {
						accountId: candidate.accountId,
						error
					});
					await recordAttempt({
						accountId: candidate.accountId,
						extras: candidate.extras,
						now: new Date(),
						error
					}).catch((recordError) => {
						console.error('[exact-preview.thumbnail.record-failed]', {
							accountId: candidate.accountId,
							error: recordError
						});
					});
					summary.failed += 1;
				}
			})
		);
	}

	return summary;
}
