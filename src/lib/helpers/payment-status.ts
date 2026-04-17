export type FailureKind = 'cancelled' | 'failed';

const SUCCESS_STATUSES = new Set(['PAID', 'OVERPAID']);
const PENDING_STATUSES = new Set([
	'',
	'PENDING',
	'PROCESSING',
	'PENDING_PAYMENT',
	'PARTIALLY_PAID',
	'NOT_FOUND',
	'ERROR',
	'UNKNOWN'
]);
const CANCELLED_STATUSES = new Set(['CANCELLED', 'CANCELED', 'ABANDONED', 'EXPIRED', 'USER_CANCELLED']);
const FAILED_STATUSES = new Set([
	'FAILED',
	'REJECTED',
	'REJECTED_PAYMENT',
	'REVERSED',
	'PAYMENT_GATEWAY_ERROR'
]);

export function normalizePaymentStatus(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.trim().toUpperCase();
}

export function isSuccessPaymentStatus(status: string): boolean {
	return SUCCESS_STATUSES.has(status);
}

export function isPendingPaymentStatus(status: string): boolean {
	return PENDING_STATUSES.has(status);
}

export function isTerminalFailureStatus(status: string): boolean {
	return CANCELLED_STATUSES.has(status) || FAILED_STATUSES.has(status);
}

export function getFailureKind(status: string): FailureKind | null {
	if (!status) return null;
	if (CANCELLED_STATUSES.has(status)) return 'cancelled';
	if (FAILED_STATUSES.has(status)) return 'failed';
	return null;
}

export function getFailureOrderStatus(kind: FailureKind): 'cancelled' | 'failed' {
	return kind === 'cancelled' ? 'cancelled' : 'failed';
}

export function getPendingPaymentPhase(status: string): 'pending' | 'processing' {
	return status === 'PROCESSING' ? 'processing' : 'pending';
}
