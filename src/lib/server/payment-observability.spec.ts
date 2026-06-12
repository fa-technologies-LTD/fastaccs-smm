import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createPaymentTraceId,
	logPaymentEvent,
	sanitizePaymentEventContext
} from './payment-observability';

describe('payment observability', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('accepts a safe incoming request correlation ID', () => {
		const request = new Request('https://smm.fastaccs.com/api/orders', {
			headers: { 'x-request-id': 'vercel-request_123:iad1' }
		});

		expect(createPaymentTraceId(request)).toBe('vercel-request_123:iad1');
	});

	it('replaces an unsafe incoming request correlation ID', () => {
		const request = new Request('https://smm.fastaccs.com/api/orders', {
			headers: { 'x-request-id': 'unsafe request with spaces and secrets' }
		});

		expect(createPaymentTraceId(request)).not.toContain('unsafe request');
	});

	it('emits only the explicitly approved payment diagnostic fields', () => {
		const safe = sanitizePaymentEventContext({
			traceId: 'trace-123',
			orderId: 'order-123',
			paymentReference: 'ORD_123',
			amount: 2500,
			currency: 'NGN',
			errorMessage: 'Provider timed out'
		});

		expect(safe).toMatchObject({
			traceId: 'trace-123',
			orderId: 'order-123',
			paymentReference: 'ORD_123',
			amount: 2500,
			currency: 'NGN',
			errorMessage: 'Provider timed out'
		});
		expect(safe).not.toHaveProperty('customerEmail');
		expect(safe).not.toHaveProperty('secret');
		expect(safe).not.toHaveProperty('checkoutUrl');
	});

	it('logs a sanitized structured payment event', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

		logPaymentEvent('info', 'initialize.started', {
			traceId: 'trace-123',
			orderId: 'order-123',
			amount: 2500,
			currency: 'NGN'
		});

		expect(info).toHaveBeenCalledWith(
			'[payments.initialize.started]',
			expect.objectContaining({
				traceId: 'trace-123',
				orderId: 'order-123',
				amount: 2500,
				currency: 'NGN'
			})
		);
	});

	it('redacts sensitive-looking provider error text', () => {
		const safe = sanitizePaymentEventContext({
			errorMessage: 'buyer@example.com token=provider-secret password:buyer-password'
		});

		expect(safe.errorMessage).toBe(
			'[redacted-email] token=[redacted] password=[redacted]'
		);
	});
});

