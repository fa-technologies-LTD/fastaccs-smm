import { env } from '$env/dynamic/private';

const DEFAULT_PENDING_PAYMENT_EXPIRE_MINUTES = 20;
const PAYMENT_RESERVATION_BUFFER_MINUTES = 5;
const NON_EXPIRING_PENDING_STATUSES = new Set(['ERROR']);

function parseExpireMinutes(): number {
	const parsed = Number(
		env.PAYMENT_PENDING_EXPIRE_MINUTES || DEFAULT_PENDING_PAYMENT_EXPIRE_MINUTES
	);
	if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PENDING_PAYMENT_EXPIRE_MINUTES;
	return Math.max(1, Math.floor(parsed));
}

export function getPendingPaymentExpireMinutes(): number {
	return parseExpireMinutes();
}

export function getPendingPaymentExpiresAt(from = new Date()): Date {
	return new Date(from.getTime() + getPendingPaymentExpireMinutes() * 60 * 1000);
}

export function getPaymentReservationExpiresAt(paymentExpiresAt: Date): Date {
	return new Date(paymentExpiresAt.getTime() + PAYMENT_RESERVATION_BUFFER_MINUTES * 60 * 1000);
}

export function getPendingPaymentExpiryThreshold(
	expireMinutes = getPendingPaymentExpireMinutes()
): number {
	return Date.now() - Math.max(1, expireMinutes) * 60 * 1000;
}

export function isPendingPaymentExpired(
	createdAt: Date,
	gatewayStatus = '',
	expireMinutes = getPendingPaymentExpireMinutes()
): boolean {
	const normalizedStatus = String(gatewayStatus || '')
		.trim()
		.toUpperCase();
	if (NON_EXPIRING_PENDING_STATUSES.has(normalizedStatus)) return false;
	return createdAt.getTime() <= getPendingPaymentExpiryThreshold(expireMinutes);
}
