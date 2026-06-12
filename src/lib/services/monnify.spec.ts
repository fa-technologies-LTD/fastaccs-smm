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
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
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

	it('allows every merchant-enabled checkout channel by omitting paymentMethods', async () => {
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
						checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123',
						transactionReference: 'MNFY|TEST|123',
						paymentReference: 'ORD_TEST_123'
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
			checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123',
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
			metaData: { orderId: 'order-123', userId: 'user-123' }
		});
		expect(body).not.toHaveProperty('paymentMethods');
		expect(String(body.contractCode || '')).not.toHaveLength(0);
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects invalid amount %s before authenticating or initializing',
		async (amount) => {
			const fetchMock = vi.fn();
			vi.stubGlobal('fetch', fetchMock);

			const { initializeTransaction } = await import('./monnify');
			const result = await initializeTransaction({
				amount,
				customerName: 'FastAccs Buyer',
				customerEmail: 'buyer@example.com',
				paymentReference: 'ORD_INVALID_AMOUNT',
				paymentDescription: 'Payment for order TEST',
				redirectUrl: 'https://smm.fastaccs.com/checkout/verify?orderId=order-123'
			});

			expect(result).toMatchObject({ success: false, errorCode: 'invalid_amount' });
			expect(fetchMock).not.toHaveBeenCalled();
		}
	);

	it.each([
		[
			'missing payment reference',
			{
				transactionReference: 'MNFY|TEST|123',
				checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123'
			},
			'provider_payment_reference_missing'
		],
		[
			'mismatched payment reference',
			{
				paymentReference: 'ORD_OTHER',
				transactionReference: 'MNFY|TEST|123',
				checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123'
			},
			'provider_payment_reference_mismatch'
		],
		[
			'missing transaction reference',
			{
				paymentReference: 'ORD_TEST_123',
				checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123'
			},
			'provider_transaction_reference_missing'
		],
		[
			'external checkout URL',
			{
				paymentReference: 'ORD_TEST_123',
				transactionReference: 'MNFY|TEST|123',
				checkoutUrl: 'https://example.com/checkout/MNFY%7CTEST%7C123'
			},
			'provider_checkout_url_invalid'
		],
		[
			'checkout URL bound to another transaction',
			{
				paymentReference: 'ORD_TEST_123',
				transactionReference: 'MNFY|TEST|123',
				checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7COTHER%7C456'
			},
			'provider_checkout_url_mismatch'
		],
		[
			'checkout URL containing only a partial transaction reference',
			{
				paymentReference: 'ORD_TEST_123',
				transactionReference: 'MNFY|TEST|123',
				checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C1234'
			},
			'provider_checkout_url_mismatch'
		],
		[
			'mismatched optional amount',
			{
				paymentReference: 'ORD_TEST_123',
				transactionReference: 'MNFY|TEST|123',
				checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123',
				amount: 0
			},
			'provider_amount_mismatch'
		],
		[
			'mismatched optional currency',
			{
				paymentReference: 'ORD_TEST_123',
				transactionReference: 'MNFY|TEST|123',
				checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123',
				currencyCode: 'USD'
			},
			'provider_currency_mismatch'
		]
	])('rejects a successful response with %s', async (_label, responseBody, errorCode) => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).endsWith('/api/v1/auth/login')) {
				return jsonResponse({
					requestSuccessful: true,
					responseBody: { accessToken: 'access-token', expiresIn: 3600 }
				});
			}

			return jsonResponse({
				requestSuccessful: true,
				responseCode: '0',
				responseMessage: 'success',
				responseBody
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const { initializeTransaction } = await import('./monnify');
		const result = await initializeTransaction({
			amount: 2500,
			customerName: 'FastAccs Buyer',
			customerEmail: 'buyer@example.com',
			paymentReference: 'ORD_TEST_123',
			paymentDescription: 'Payment for order TEST',
			redirectUrl: 'https://smm.fastaccs.com/checkout/verify?orderId=order-123'
		});

		expect(result).toMatchObject({
			success: false,
			error: 'Payment setup could not be completed. Please try again.',
			errorCode
		});
	});

	it('rejects an HTTP error even when its JSON body claims success', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).endsWith('/api/v1/auth/login')) {
				return jsonResponse({
					requestSuccessful: true,
					responseBody: { accessToken: 'access-token', expiresIn: 3600 }
				});
			}

			return new Response(
				JSON.stringify({
					requestSuccessful: true,
					responseCode: '0',
					responseBody: {
						paymentReference: 'ORD_TEST_123',
						transactionReference: 'MNFY|TEST|123',
						checkoutUrl: 'https://sandbox.sdk.monnify.com/checkout/MNFY%7CTEST%7C123'
					}
				}),
				{ status: 502, headers: { 'Content-Type': 'application/json' } }
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		const { initializeTransaction } = await import('./monnify');
		const result = await initializeTransaction({
			amount: 2500,
			customerName: 'FastAccs Buyer',
			customerEmail: 'buyer@example.com',
			paymentReference: 'ORD_TEST_123',
			paymentDescription: 'Payment for order TEST',
			redirectUrl: 'https://smm.fastaccs.com/checkout/verify?orderId=order-123'
		});

		expect(result).toMatchObject({
			success: false,
			errorCode: 'provider_initialization_failed'
		});
	});

	it('returns a controlled failure when Monnify does not return a checkout URL', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const requestUrl = String(input);

			if (requestUrl.endsWith('/api/v1/auth/login')) {
				return jsonResponse({
					requestSuccessful: true,
					responseBody: { accessToken: 'access-token', expiresIn: 3600 }
				});
			}

			return jsonResponse({
				requestSuccessful: false,
				responseCode: '99',
				responseMessage: 'Provider initialization failed'
			});
		});
		vi.stubGlobal('fetch', fetchMock);

		const { initializeTransaction } = await import('./monnify');
		const result = await initializeTransaction({
			amount: 2500,
			customerName: 'FastAccs Buyer',
			customerEmail: 'buyer@example.com',
			paymentReference: 'ORD_TEST_FAILED',
			paymentDescription: 'Payment for order TEST',
			redirectUrl: 'https://smm.fastaccs.com/checkout/verify?orderId=order-123',
			metaData: { orderId: 'order-123', userId: 'user-123' },
			traceId: 'test-trace',
			orderId: 'order-123'
		});

		expect(result).toEqual({
			success: false,
			error: 'Payment setup could not be completed. Please try again.',
			errorCode: 'provider_initialization_failed'
		});
	});
});
