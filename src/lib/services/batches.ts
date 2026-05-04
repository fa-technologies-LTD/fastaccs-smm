// Types for batch management (updated for Prisma)
export interface AccountBatch {
	id: string;
	categoryId: string;
	supplier: string | null;
	costPerUnit: number | null;
	descriptors: Record<string, unknown>;
	linksRaw: string | null;
	logsRaw: string | null;
	notes: string | null;
	totalUnits: number;
	remainingUnits: number;
	createdAt: string;
	updatedAt: string;
}

export interface Account {
	id: string;
	batchId: string;
	categoryId: string;
	platform: string;
	linkUrl: string | null;
	username: string | null;
	password: string | null;
	email: string | null;
	emailPassword: string | null;
	twoFa: string | null;
	twoFactorEnabled: boolean | null;
	easyLoginEnabled: boolean | null;
	ageMonths: number | null;
	niche: string | null;
	qualityScore: number | null;
	credentialExtras: Record<string, string> | null;
	status: 'available' | 'reserved' | 'allocated' | 'delivered' | 'failed' | 'retired';
	reservedUntil: string | null;
	orderItemId: string | null;
	deliveredAt: string | null;
	deliveryNotes: string | null;
	createdAt: string;
}

export interface AccountInsert {
	batchId: string;
	categoryId: string;
	platform: string;
	linkUrl?: string | null;
	username?: string | null;
	password?: string | null;
	email?: string | null;
	emailPassword?: string | null;
	twoFa?: string | null;
	twoFactorEnabled?: boolean | null;
	easyLoginEnabled?: boolean | null;
	ageMonths?: number | null;
	niche?: string | null;
	qualityScore?: number | null;
	credentialExtras?: Record<string, string> | null;
}

export interface BatchMetadata {
	id: string;
	name: string;
	description?: string;
	tier_id: string;
	total_accounts: number;
	processed_accounts: number;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	created_at: string;
	updated_at: string;
	metadata?: {
		filename?: string;
		upload_date?: string;
		file_size?: number;
		headers?: string[];
		field_map?: Array<{
			header: string;
			normalized: string;
			mapped_to: string | null;
			label: string;
		}>;
	};
}

const KNOWN_BATCH_STATUSES = new Set(['pending', 'processing', 'completed', 'failed']);

function asError(message: string) {
	return { message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim().length > 0) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return fallback;
}

function toStringValue(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function normalizeBatchStatus(status: unknown): BatchMetadata['status'] {
	const normalized = String(status || '')
		.trim()
		.toLowerCase();
	if (KNOWN_BATCH_STATUSES.has(normalized)) {
		return normalized as BatchMetadata['status'];
	}
	return 'pending';
}

function toBatchMetadata(batch: Record<string, unknown>): BatchMetadata {
	const descriptors = asRecord(batch.descriptors) || {};
	const totalUnits = toNumber(batch.totalUnits ?? batch.total_units, 0);
	const remainingUnits = toNumber(batch.remainingUnits ?? batch.remaining_units, 0);
	const descriptorProcessed = toNumber(descriptors.processed_accounts, Number.NaN);
	const processedAccounts =
		Number.isFinite(descriptorProcessed) && descriptorProcessed >= 0
			? descriptorProcessed
			: Math.max(0, totalUnits - remainingUnits);

	return {
		id: toStringValue(batch.id),
		name: toStringValue(batch.supplier) || 'Unnamed Batch',
		description: toStringValue(batch.notes) || '',
		tier_id: toStringValue(batch.categoryId ?? batch.category_id),
		total_accounts: totalUnits,
		processed_accounts: processedAccounts,
		status: normalizeBatchStatus(batch.importStatus ?? descriptors.status),
		created_at: toStringValue(batch.createdAt ?? batch.created_at),
		updated_at: toStringValue(batch.updatedAt ?? batch.updated_at ?? batch.createdAt ?? batch.created_at),
		metadata: descriptors
	};
}

// Get all batches in BatchMetadata format
export async function getBatches(fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn('/api/batches');
		const result = await response.json();

		if (result.error) {
			return { data: null, error: asError(String(result.error)) };
		}

		const rawBatches: unknown[] = Array.isArray(result.data) ? result.data : [];
		const batches = rawBatches.map((batch: unknown) => toBatchMetadata(asRecord(batch) || {}));
		return { data: batches, error: null };
	} catch (error) {
		console.error('Error fetching batches:', error);
		return { data: null, error: asError('Failed to fetch batches') };
	}
}

// Get batches by tier
export async function getBatchesByTier(categoryId: string, fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn(`/api/batches?categoryId=${encodeURIComponent(categoryId)}`);
		const result = await response.json();
		if (result.error) {
			return { data: null, error: asError(String(result.error)) };
		}
		return { data: result.data || [], error: null };
	} catch (error) {
		console.error('Error fetching batches by tier:', error);
		return { data: null, error: asError('Failed to fetch batches') };
	}
}

// Get batch by ID in BatchMetadata format
export async function getBatchById(id: string, fetchFn: typeof fetch = fetch) {
	try {
		const response = await fetchFn(`/api/batches/${id}`);
		const result = await response.json();
		if (result.error || !result.data) {
			return { data: null, error: asError(String(result.error || 'Batch not found')) };
		}

		const batch = toBatchMetadata(asRecord(result.data) || {});
		return { data: batch, error: null };
	} catch (error) {
		console.error('Error fetching batch:', error);
		return { data: null, error: asError('Failed to fetch batch') };
	}
}
