import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
}

describe('Monnify checkout initialization', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.stubEnv('MONNIFY_API_KEY', 'test-api-key');
		vi.stubEnv('MONNIFY_SECRET_KEY', 'test-secret-key');
		vi.stubEnv('MONNIFY_BASE_URL', 'https://sandbox.monnify.test');
		vi.stubEnv('MONNIFY_CONTRACT_CODE', '1234567890');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('requests card and account transfer on hosted checkout sessions', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
			const requestUrl = String(input);

			if (requestUrl.endsWith('/api/v1/auth/login')) {
				return jsonResponse({
					requestSuccessful: true,
					responseBody: { accessToken: 'access-token', expiresIn: 3600 }
				});
			}

			if (requestUrl.endsWith('/api/v1/merchant/transactions/init-transaction')) {
				return jsonResponse({
					requestSuccessful: true,
					responseBody: {
						checkoutUrl: 'https://checkout.monnify.test/session',
						transactionReference: 'MNFY|TEST|123'
					}
				});
			}

			throw new Error(`Unexpected Monnify request: ${requestUrl}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		const { initializeTransaction } = await import('./monnify');
		const result = await initializeTransaction({
			amount: 2500,
			customerName: 'FastAccs Buyer',
			customerEmail: 'buyer@example.com',
			paymentReference: 'ORD_TEST_123',
			paymentDescription: 'Payment for order TEST',
			redirectUrl: 'https://smm.fastaccs.com/checkout/verify?orderId=order-123',
			metaData: { orderId: 'order-123', userId: 'user-123' }
		});

		expect(result).toEqual({
			success: true,
			checkoutUrl: 'https://checkout.monnify.test/session',
			transactionReference: 'MNFY|TEST|123'
		});
		expect(fetchMock).toHaveBeenCalledTimes(2);

		const [, initOptions] = fetchMock.mock.calls[1];
		const body = JSON.parse(String((initOptions as RequestInit).body));

		expect(body).toMatchObject({
			amount: 2500,
			customerName: 'FastAccs Buyer',
			customerEmail: 'buyer@example.com',
			paymentReference: 'ORD_TEST_123',
			paymentDescription: 'Payment for order TEST',
			currencyCode: 'NGN',
			redirectUrl: 'https://smm.fastaccs.com/checkout/verify?orderId=order-123',
			paymentMethods: ['CARD', 'ACCOUNT_TRANSFER'],
			metaData: { orderId: 'order-123', userId: 'user-123' }
		});
		expect(String(body.contractCode || '')).not.toHaveLength(0);
	});
});
