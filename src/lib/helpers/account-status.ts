export const ACCOUNT_STATUS_ALLOCATED = 'allocated';
export const ACCOUNT_STATUS_LEGACY_ASSIGNED = 'assigned';

const ALLOCATED_LIKE_STATUS_SET = new Set([
	ACCOUNT_STATUS_ALLOCATED,
	ACCOUNT_STATUS_LEGACY_ASSIGNED
]);

export function normalizeAccountStatus(status: unknown): string {
	const normalized = String(status || '')
		.trim()
		.toLowerCase();
	if (!normalized) return '';
	if (normalized === ACCOUNT_STATUS_LEGACY_ASSIGNED) {
		return ACCOUNT_STATUS_ALLOCATED;
	}
	return normalized;
}

export function isAllocatedLikeAccountStatus(status: unknown): boolean {
	const normalized = String(status || '')
		.trim()
		.toLowerCase();
	return ALLOCATED_LIKE_STATUS_SET.has(normalized);
}

export function getAllocatedLikeAccountStatuses(): string[] {
	return [ACCOUNT_STATUS_ALLOCATED, ACCOUNT_STATUS_LEGACY_ASSIGNED];
}
