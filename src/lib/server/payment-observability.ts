import { randomUUID } from 'node:crypto';

export type PaymentLogLevel = 'info' | 'warn' | 'error';

export interface PaymentEventContext {
	traceId?: string | null;
	orderId?: string | null;
	userId?: string | null;
	source?: string | null;
	phase?: string | null;
	status?: string | null;
	paymentReference?: string | null;
	providerPaymentReference?: string | null;
	transactionReference?: string | null;
	referenceUsed?: string | null;
	success?: boolean | null;
	resumed?: boolean | null;
	amount?: number | null;
	amountPaid?: number | null;
	currency?: string | null;
	expectedAmount?: number | null;
	expectedCurrency?: string | null;
	providerAmount?: number | null;
	providerCurrency?: string | null;
	httpStatus?: number | null;
	responseCode?: string | null;
	errorCode?: string | null;
	errorMessage?: string | null;
}

function sanitizeText(value: string | null | undefined, maxLength = 300): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.replace(/\s+/g, ' ').trim();
	return normalized ? normalized.slice(0, maxLength) : null;
}

function sanitizeNumber(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeErrorMessage(value: string | null | undefined): string | null {
	const sanitized = sanitizeText(value, 300);
	if (!sanitized) return null;

	return sanitized
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
		.replace(
			/\b(api[_-]?key|secret|token|authorization|password)\b\s*[:=]\s*[^\s,;]+/gi,
			'$1=[redacted]'
		);
}

export function createPaymentTraceId(request?: Request): string {
	const incoming = sanitizeText(request?.headers.get('x-request-id'), 100);
	if (incoming && /^[a-zA-Z0-9._:-]+$/.test(incoming)) {
		return incoming;
	}
	return randomUUID();
}

export function sanitizePaymentEventContext(
	context: PaymentEventContext
): Record<string, string | number | boolean | null> {
	const safe = {
		traceId: sanitizeText(context.traceId, 100),
		orderId: sanitizeText(context.orderId, 100),
		userId: sanitizeText(context.userId, 100),
		source: sanitizeText(context.source, 60),
		phase: sanitizeText(context.phase, 60),
		status: sanitizeText(context.status, 80),
		paymentReference: sanitizeText(context.paymentReference, 160),
		providerPaymentReference: sanitizeText(context.providerPaymentReference, 160),
		transactionReference: sanitizeText(context.transactionReference, 200),
		referenceUsed: sanitizeText(context.referenceUsed, 200),
		success: typeof context.success === 'boolean' ? context.success : null,
		resumed: typeof context.resumed === 'boolean' ? context.resumed : null,
		amount: sanitizeNumber(context.amount),
		amountPaid: sanitizeNumber(context.amountPaid),
		currency: sanitizeText(context.currency, 12),
		expectedAmount: sanitizeNumber(context.expectedAmount),
		expectedCurrency: sanitizeText(context.expectedCurrency, 12),
		providerAmount: sanitizeNumber(context.providerAmount),
		providerCurrency: sanitizeText(context.providerCurrency, 12),
		httpStatus: sanitizeNumber(context.httpStatus),
		responseCode: sanitizeText(context.responseCode, 80),
		errorCode: sanitizeText(context.errorCode, 100),
		errorMessage: sanitizeErrorMessage(context.errorMessage)
	};

	return Object.fromEntries(
		Object.entries(safe).filter(([, value]) => value !== null)
	) as Record<string, string | number | boolean | null>;
}

export function logPaymentEvent(
	level: PaymentLogLevel,
	event: string,
	context: PaymentEventContext
): void {
	const safeEvent = sanitizeText(event, 100) || 'unknown';
	const payload = sanitizePaymentEventContext(context);
	console[level](`[payments.${safeEvent}]`, payload);
}
