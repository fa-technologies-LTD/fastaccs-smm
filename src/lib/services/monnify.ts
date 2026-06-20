import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';
import { logPaymentEvent } from '$lib/server/payment-observability';
import {
	getMonnifyInitializationErrorMessage,
	getMonnifyInitializationIssue,
	MONNIFY_CURRENCY,
	type MonnifyInitializationIssue
} from '$lib/helpers/monnify-initialization.server';

const MONNIFY_API_KEY = env.MONNIFY_API_KEY || '';
const MONNIFY_SECRET_KEY = env.MONNIFY_SECRET_KEY || '';
const MONNIFY_BASE_URL = env.MONNIFY_BASE_URL || '';
const MONNIFY_CONTRACT_CODE = env.MONNIFY_CONTRACT_CODE || '';
const PAYMENT_SETUP_ERROR = 'Payment setup could not be completed. Please try again.';

// Token cache — re-used until 5 minutes before expiry
let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Get a valid Monnify Bearer access token.
 * Fetches a new one if the cached token is missing or about to expire.
 */
export async function getAccessToken(): Promise<string> {
	const now = Date.now();

	if (cachedToken && cachedToken.expiresAt > now) {
		return cachedToken.value;
	}

	const credentials = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString('base64');

	const response = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
		method: 'POST',
		headers: {
			Authorization: `Basic ${credentials}`,
			'Content-Type': 'application/json'
		}
	});

	const data = await response.json();

	if (!data.requestSuccessful || !data.responseBody?.accessToken) {
		throw new Error(`Monnify auth failed: ${data.responseMessage || 'Unknown error'}`);
	}

	const expiresIn: number = data.responseBody.expiresIn ?? 3600; // seconds
	// Cache with a 5-minute buffer
	cachedToken = {
		value: data.responseBody.accessToken,
		expiresAt: now + (expiresIn - 300) * 1000
	};

	return cachedToken.value;
}

export interface TransactionVerificationResult {
	success: boolean;
	transactionReference: string;
	paymentReference: string;
	amount: number;
	amountPaid: number;
	currency: string;
	paymentStatus: string;
	paidOn?: Date;
	paymentMethod?: string;
	metaData?: Record<string, unknown>;
}

interface MonnifyVerificationEnvelope {
	requestSuccessful?: boolean;
	responseCode?: string;
	responseMessage?: string;
	responseBody?: unknown;
}

interface MonnifyTransactionPayload {
	transactionReference?: string;
	paymentReference?: string;
	amount?: number | string;
	amountPaid?: number | string;
	currencyCode?: string;
	currency?: string;
	paymentStatus?: string;
	paidOn?: string;
	paymentMethod?: string;
	metaData?: Record<string, unknown>;
}

interface VerificationAttempt {
	label: string;
	url: string;
}

function parseAmount(value: unknown): number {
	const amount = Number(value);
	return Number.isFinite(amount) ? amount : 0;
}

function extractTransactionPayload(responseBody: unknown): MonnifyTransactionPayload | null {
	if (!responseBody) return null;

	// v1 query endpoint often returns { content: [...] }
	if (
		typeof responseBody === 'object' &&
		responseBody !== null &&
		Array.isArray((responseBody as { content?: unknown[] }).content)
	) {
		const row = (responseBody as { content: unknown[] }).content[0];
		if (row && typeof row === 'object') {
			return row as MonnifyTransactionPayload;
		}
	}

	// Sometimes response body may already be an array.
	if (Array.isArray(responseBody)) {
		const row = responseBody[0];
		if (row && typeof row === 'object') {
			return row as MonnifyTransactionPayload;
		}
		return null;
	}

	// v2 endpoints usually return transaction object directly.
	if (typeof responseBody === 'object' && responseBody !== null) {
		return responseBody as MonnifyTransactionPayload;
	}

	return null;
}

function matchesRequestedReference(
	reference: string,
	isMonnifyReference: boolean,
	transaction: MonnifyTransactionPayload
): boolean {
	const txReference = String(transaction.transactionReference || '').trim();
	const paymentReference = String(transaction.paymentReference || '').trim();

	if (isMonnifyReference) {
		return txReference === reference;
	}

	return paymentReference === reference;
}

function mapVerificationResult(
	reference: string,
	transaction: MonnifyTransactionPayload
): TransactionVerificationResult {
	const paymentStatus = String(transaction.paymentStatus || '').toUpperCase();
	const paidOn = typeof transaction.paidOn === 'string' ? new Date(transaction.paidOn) : undefined;

	return {
		success: paymentStatus === 'PAID',
		transactionReference: String(transaction.transactionReference || reference),
		paymentReference: String(transaction.paymentReference || ''),
		amount: parseAmount(transaction.amount),
		amountPaid: parseAmount(transaction.amountPaid),
		currency: String(transaction.currencyCode || transaction.currency || 'NGN'),
		paymentStatus: paymentStatus || 'UNKNOWN',
		paidOn: paidOn && !Number.isNaN(paidOn.getTime()) ? paidOn : undefined,
		paymentMethod: String(transaction.paymentMethod || ''),
		metaData:
			transaction.metaData && typeof transaction.metaData === 'object' ? transaction.metaData : {}
	};
}

/**
 * Verify a transaction with Monnify.
 * Accepts either our paymentReference (ORD_...) or Monnify's transactionReference (MNFY|...).
 */
export async function verifyTransaction(reference: string): Promise<TransactionVerificationResult> {
	try {
		const token = await getAccessToken();
		const isMonnifyRef = reference.startsWith('MNFY|');
		const encodedReference = encodeURIComponent(reference);

		// Safe rollout: v2-first, then fallback to current v1 route.
		// We only treat an attempt as usable when transaction data is actually returned.
		const attempts: VerificationAttempt[] = isMonnifyRef
			? [
					{
						label: 'v2_transaction_reference',
						url: `${MONNIFY_BASE_URL}/api/v2/transactions/${encodedReference}`
					},
					{
						label: 'v2_query_transaction_reference',
						url: `${MONNIFY_BASE_URL}/api/v2/merchant/transactions/query?transactionReference=${encodedReference}`
					},
					{
						label: 'v1_query_transaction_reference',
						url: `${MONNIFY_BASE_URL}/api/v1/merchant/transactions/query?transactionReference=${encodedReference}`
					}
				]
			: [
					{
						label: 'v2_query_payment_reference',
						url: `${MONNIFY_BASE_URL}/api/v2/merchant/transactions/query?paymentReference=${encodedReference}`
					},
					{
						label: 'v1_query_payment_reference',
						url: `${MONNIFY_BASE_URL}/api/v1/merchant/transactions/query?paymentReference=${encodedReference}`
					}
				];

		for (const attempt of attempts) {
			try {
				const response = await fetch(attempt.url, {
					method: 'GET',
					headers: {
						Authorization: `Bearer ${token}`
					}
				});

				let payload: MonnifyVerificationEnvelope | null = null;
				try {
					payload = (await response.json()) as MonnifyVerificationEnvelope;
				} catch {
					payload = null;
				}

				const transaction = extractTransactionPayload(payload?.responseBody);
				const referenceMatches = transaction
					? matchesRequestedReference(reference, isMonnifyRef, transaction)
					: false;

				console.info('[monnify.verify] attempt_result', {
					reference,
					attempt: attempt.label,
					httpStatus: response.status,
					requestSuccessful: payload?.requestSuccessful ?? null,
					responseCode: payload?.responseCode ?? null,
					responseMessage: payload?.responseMessage ?? null,
					hasTransaction: Boolean(transaction),
					referenceMatches
				});

				if (!transaction || !referenceMatches) {
					continue;
				}

				return mapVerificationResult(reference, transaction);
			} catch (attemptError) {
				console.warn('[monnify.verify] attempt_error', {
					reference,
					attempt: attempt.label,
					error: attemptError instanceof Error ? attemptError.message : String(attemptError)
				});
				continue;
			}
		}

		console.warn('[monnify.verify] no_transaction_found_after_fallback', {
			reference,
			referenceType: isMonnifyRef ? 'transaction_reference' : 'payment_reference'
		});

		return {
			success: false,
			transactionReference: reference,
			paymentReference: '',
			amount: 0,
			amountPaid: 0,
			currency: 'NGN',
			paymentStatus: 'not_found'
		};
	} catch (error) {
		console.error('Monnify verification error:', error);
		return {
			success: false,
			transactionReference: reference,
			paymentReference: '',
			amount: 0,
			amountPaid: 0,
			currency: 'NGN',
			paymentStatus: 'error'
		};
	}
}

/**
 * Verify a Monnify webhook signature.
 * Monnify signs the full raw request body with HMAC-SHA512 using the secret key.
 * The signature is sent in the `monnify-signature` header.
 * @param signature Value from `monnify-signature` header
 * @param rawBody Raw request body string
 */
export function verifyWebhookSignature(signature: string, rawBody: string): boolean {
	try {
		const hash = createHmac('sha512', MONNIFY_SECRET_KEY).update(rawBody).digest('hex');
		return hash === signature;
	} catch (error) {
		console.error('Monnify webhook signature verification error:', error);
		return false;
	}
}

export interface InitTransactionParams {
	amount: number;
	currency?: string;
	customerName: string;
	customerEmail: string;
	paymentReference: string;
	paymentDescription: string;
	redirectUrl: string;
	metaData?: Record<string, unknown>;
	traceId?: string;
	orderId?: string;
}

export interface InitTransactionResult {
	success: boolean;
	checkoutUrl?: string;
	transactionReference?: string;
	error?: string;
	errorCode?: MonnifyInitializationIssue | ProviderInitializationErrorCode;
}

type ProviderInitializationErrorCode =
	| 'provider_initialization_failed'
	| 'provider_payment_reference_missing'
	| 'provider_payment_reference_mismatch'
	| 'provider_transaction_reference_missing'
	| 'provider_checkout_url_invalid'
	| 'provider_checkout_url_mismatch'
	| 'provider_amount_mismatch'
	| 'provider_currency_mismatch';

interface MonnifyInitializationResponseBody {
	checkoutUrl?: unknown;
	transactionReference?: unknown;
	paymentReference?: unknown;
	amount?: unknown;
	currencyCode?: unknown;
	currency?: unknown;
}

function hasOwn(object: object, property: string): boolean {
	return Object.prototype.hasOwnProperty.call(object, property);
}

function normalizeProviderString(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function amountsMatch(expected: number, actual: number): boolean {
	return Math.round(expected * 100) === Math.round(actual * 100);
}

function validateCheckoutUrl(
	checkoutUrl: string,
	transactionReference: string
): ProviderInitializationErrorCode | null {
	try {
		const parsedUrl = new URL(checkoutUrl);
		const hostname = parsedUrl.hostname.toLowerCase();
		if (
			parsedUrl.protocol !== 'https:' ||
			(hostname !== 'monnify.com' && !hostname.endsWith('.monnify.com'))
		) {
			return 'provider_checkout_url_invalid';
		}

		let decodedPathname = parsedUrl.pathname;
		try {
			decodedPathname = decodeURIComponent(parsedUrl.pathname);
		} catch {
			return 'provider_checkout_url_invalid';
		}

		return decodedPathname.split('/').includes(transactionReference)
			? null
			: 'provider_checkout_url_mismatch';
	} catch {
		return 'provider_checkout_url_invalid';
	}
}

function validateInitializationResponse(
	responseBody: MonnifyInitializationResponseBody,
	params: InitTransactionParams,
	currency: string
): ProviderInitializationErrorCode | null {
	const providerPaymentReference = normalizeProviderString(responseBody.paymentReference);
	if (!providerPaymentReference) return 'provider_payment_reference_missing';
	if (providerPaymentReference !== params.paymentReference) {
		return 'provider_payment_reference_mismatch';
	}

	const transactionReference = normalizeProviderString(responseBody.transactionReference);
	if (!transactionReference) return 'provider_transaction_reference_missing';

	const checkoutUrl = normalizeProviderString(responseBody.checkoutUrl);
	const checkoutUrlIssue = validateCheckoutUrl(checkoutUrl, transactionReference);
	if (checkoutUrlIssue) return checkoutUrlIssue;

	if (hasOwn(responseBody, 'amount')) {
		const providerAmount = Number(responseBody.amount);
		if (!Number.isFinite(providerAmount) || !amountsMatch(params.amount, providerAmount)) {
			return 'provider_amount_mismatch';
		}
	}

	if (hasOwn(responseBody, 'currencyCode') || hasOwn(responseBody, 'currency')) {
		const providerCurrency = normalizeProviderString(
			responseBody.currencyCode || responseBody.currency
		).toUpperCase();
		if (providerCurrency !== currency) return 'provider_currency_mismatch';
	}

	return null;
}

/**
 * Initialize a Monnify transaction server-side.
 * Returns a hosted checkoutUrl — no keys are ever sent to the browser.
 */
function sanitizeCustomerName(value: string): string {
	// Payment APIs (incl. Monnify) reject names containing emoji or chars above
	// the Basic Multilingual Plane (U+10000+). Strip supplementary-plane chars
	// (covers most emoji including 👽), variation selectors U+FE00-FE0F,
	// and zero-width joiners, then collapse whitespace.
	const cleaned = value
		.replace(/[\u{10000}-\u{10FFFF}]/gu, '')
		.replace(/[\uFE00-\uFE0F\u200C-\u200D]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return cleaned || 'Customer';
}

export async function initializeTransaction(
	params: InitTransactionParams
): Promise<InitTransactionResult> {
	const currency = String(params.currency || MONNIFY_CURRENCY)
		.trim()
		.toUpperCase();
	const inputIssue = getMonnifyInitializationIssue({ amount: params.amount, currency });
	if (inputIssue) {
		logPaymentEvent('warn', 'provider.initialize.rejected', {
			traceId: params.traceId,
			orderId: params.orderId,
			paymentReference: params.paymentReference,
			amount: params.amount,
			currency,
			errorCode: inputIssue
		});
		return {
			success: false,
			error: getMonnifyInitializationErrorMessage(inputIssue),
			errorCode: inputIssue
		};
	}

	try {
		logPaymentEvent('info', 'provider.initialize.requested', {
			traceId: params.traceId,
			orderId: params.orderId,
			paymentReference: params.paymentReference,
			amount: params.amount,
			currency
		});

		const token = await getAccessToken();

		const response = await fetch(
			`${MONNIFY_BASE_URL}/api/v1/merchant/transactions/init-transaction`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					amount: params.amount,
					customerName: sanitizeCustomerName(params.customerName),
					customerEmail: params.customerEmail,
					paymentReference: params.paymentReference,
					paymentDescription: params.paymentDescription,
					currencyCode: currency,
					contractCode: MONNIFY_CONTRACT_CODE,
					redirectUrl: params.redirectUrl,
					metaData: params.metaData
				})
			}
		);

		const data = await response.json();
		const responseBody =
			data?.responseBody && typeof data.responseBody === 'object'
				? (data.responseBody as MonnifyInitializationResponseBody)
				: {};
		const providerPaymentReference = normalizeProviderString(responseBody.paymentReference);
		const transactionReference = normalizeProviderString(responseBody.transactionReference);
		const checkoutUrl = normalizeProviderString(responseBody.checkoutUrl);
		const responseIssue =
			response.ok && data.requestSuccessful
				? validateInitializationResponse(responseBody, params, currency)
				: 'provider_initialization_failed';

		logPaymentEvent(
			data.requestSuccessful && !responseIssue ? 'info' : 'warn',
			'provider.initialize.responded',
			{
				traceId: params.traceId,
				orderId: params.orderId,
				paymentReference: params.paymentReference,
				providerPaymentReference: providerPaymentReference || null,
				transactionReference: transactionReference || null,
				providerAmount:
					hasOwn(responseBody, 'amount') && Number.isFinite(Number(responseBody.amount))
						? Number(responseBody.amount)
						: null,
				providerCurrency: String(responseBody.currencyCode || responseBody.currency || '') || null,
				httpStatus: response.status,
				responseCode: String(data.responseCode || '') || null,
				success: Boolean(data.requestSuccessful && !responseIssue),
				errorCode: responseIssue,
				errorMessage: data.requestSuccessful ? null : String(data.responseMessage || '')
			}
		);

		if (responseIssue) {
			return {
				success: false,
				error: PAYMENT_SETUP_ERROR,
				errorCode: responseIssue
			};
		}

		return {
			success: true,
			checkoutUrl,
			transactionReference
		};
	} catch (error) {
		logPaymentEvent('error', 'provider.initialize.failed', {
			traceId: params.traceId,
			orderId: params.orderId,
			paymentReference: params.paymentReference,
			amount: params.amount,
			currency,
			errorMessage: error instanceof Error ? error.message : 'Unknown error'
		});
		return {
			success: false,
			error: PAYMENT_SETUP_ERROR,
			errorCode: 'provider_initialization_failed'
		};
	}
}
