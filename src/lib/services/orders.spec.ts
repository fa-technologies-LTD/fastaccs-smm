import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOrder } from './orders';

describe('checkout API error correlation', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('preserves the safe payment trace ID in buyer-visible checkout errors', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.stubGlobal(
			'fetch',
			vi.fn(async () =>
				new Response(
					JSON.stringify({
						success: false,
						error: 'Checkout is temporarily unavailable.',
						traceId: 'payment-trace-123'
					}),
					{ status: 503, headers: { 'content-type': 'application/json' } }
				)
			)
		);

		const result = await createOrder({
			email: 'buyer@example.com',
			phone: '',
			items: [{ categoryId: 'tier-123', quantity: 1 }],
			totalAmount: 2500,
			currency: 'NGN',
			paymentMethod: 'monnify'
		});

		expect(result).toEqual({
			data: null,
			error:
				'HTTP 503: Checkout is temporarily unavailable. Reference: payment-trace-123'
		});
	});
});

