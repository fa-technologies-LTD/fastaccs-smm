import { getBatchById } from '$lib/services/batches';
import { getAccountsByBatch } from '$lib/services/accounts';
import { error } from '@sveltejs/kit';

interface BatchAccountLog {
	id: string;
	username: string | null;
	password: string | null;
	email: string | null;
	emailPassword: string | null;
	twoFa: string | null;
	linkUrl: string | null;
	platform: string | null;
	status: string;
	createdAt: string | null;
	updatedAt: string | null;
	deliveredAt: string | null;
	deliveryNotes: string | null;
	followers: number | null;
	engagementRate: number | null;
	qualityScore: number | null;
	niche: string | null;
	orderItemId: string | null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string') {
			const trimmed = value.trim();
			if (trimmed.length > 0) return trimmed;
		}
	}
	return null;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'number' && Number.isFinite(value)) return value;
		if (typeof value === 'string' && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed)) return parsed;
		}
	}
	return null;
}

function normalizeBatchAccountLog(input: unknown): BatchAccountLog {
	const record =
		input && typeof input === 'object' && !Array.isArray(input)
			? (input as Record<string, unknown>)
			: {};

	return {
		id: readString(record, 'id') || '',
		username: readString(record, 'username'),
		password: readString(record, 'password'),
		email: readString(record, 'email'),
		emailPassword: readString(record, 'emailPassword', 'email_password'),
		twoFa: readString(record, 'twoFa', 'two_fa'),
		linkUrl: readString(record, 'linkUrl', 'link_url'),
		platform: readString(record, 'platform'),
		status: readString(record, 'status') || 'available',
		createdAt: readString(record, 'createdAt', 'created_at'),
		updatedAt: readString(record, 'updatedAt', 'updated_at'),
		deliveredAt: readString(record, 'deliveredAt', 'delivered_at'),
		deliveryNotes: readString(record, 'deliveryNotes', 'delivery_notes'),
		followers: readNumber(record, 'followers'),
		engagementRate: readNumber(record, 'engagementRate', 'engagement_rate'),
		qualityScore: readNumber(record, 'qualityScore', 'quality_score'),
		niche: readString(record, 'niche'),
		orderItemId: readString(record, 'orderItemId', 'order_item_id')
	};
}

export const load = async ({
	params,
	fetch
}: {
	params: { id: string };
	fetch: typeof globalThis.fetch;
}) => {
	const batchId = params.id as string;

	// Load batch info
	const batchResult = await getBatchById(batchId, fetch);
	if (batchResult.error || !batchResult.data) {
		throw error(404, `Batch '${batchId}' not found`);
	}

	// Load accounts for this batch
	const accountsResult = await getAccountsByBatch(batchId, fetch);
	const rawAccounts = Array.isArray(accountsResult.data) ? accountsResult.data : [];
	const accounts = rawAccounts.map(normalizeBatchAccountLog);
	const batch = batchResult.data;

	if (!batch.created_at) {
		batch.created_at =
			(typeof batch.metadata?.upload_date === 'string' ? batch.metadata.upload_date : null) || '';
	}
	if (!batch.updated_at) {
		batch.updated_at = batch.created_at;
	}

	return {
		batch,
		accounts,
		error:
			typeof accountsResult.error === 'string'
				? accountsResult.error
				: (accountsResult.error as { message?: string } | null)?.message || null
	};
};
