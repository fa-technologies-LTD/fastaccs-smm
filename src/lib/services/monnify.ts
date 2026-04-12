import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';

const MONNIFY_API_KEY = env.MONNIFY_API_KEY || '';
const MONNIFY_SECRET_KEY = env.MONNIFY_SECRET_KEY || '';
const MONNIFY_BASE_URL = env.MONNIFY_BASE_URL || '';
const MONNIFY_CONTRACT_CODE = env.MONNIFY_CONTRACT_CODE || '';

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

/**
 * Verify a transaction with Monnify.
 * Accepts either our paymentReference (ORD_...) or Monnify's transactionReference (MNFY|...).
 */
export async function verifyTransaction(reference: string): Promise<TransactionVerificationResult> {
	try {
		const token = await getAccessToken();

		// Use the correct endpoint based on reference type
		const isMonnifyRef = reference.startsWith('MNFY|');
		const endpoint = isMonnifyRef
			? `${MONNIFY_BASE_URL}/api/v2/transactions/${encodeURIComponent(reference)}`
			: `${MONNIFY_BASE_URL}/api/v1/merchant/transactions/query?paymentReference=${encodeURIComponent(reference)}`;

		const response = await fetch(endpoint, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`
			}
		});

		const result = await response.json();

		if (!result.requestSuccessful || !result.responseBody) {
			return {
				success: false,
				transactionReference: reference,
				paymentReference: '',
				amount: 0,
				amountPaid: 0,
				currency: 'NGN',
				paymentStatus: 'failed'
			};
		}

		// v1 query endpoint returns a paginated wrapper ({ content: [...] });
		// v2 endpoint returns the transaction object directly.
		const tx = Array.isArray(result.responseBody?.content)
			? result.responseBody.content[0]
			: result.responseBody;

		if (!tx) {
			return {
				success: false,
				transactionReference: reference,
				paymentReference: '',
				amount: 0,
				amountPaid: 0,
				currency: 'NGN',
				paymentStatus: 'not_found'
			};
		}

		return {
			success: tx.paymentStatus === 'PAID',
			transactionReference: tx.transactionReference,
			paymentReference: tx.paymentReference,
			amount: tx.amount,
			amountPaid: tx.amountPaid,
			currency: tx.currencyCode,
			paymentStatus: tx.paymentStatus,
			paidOn: tx.paidOn ? new Date(tx.paidOn) : undefined,
			paymentMethod: tx.paymentMethod,
			metaData: tx.metaData ?? {}
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
	customerName: string;
	customerEmail: string;
	paymentReference: string;
	paymentDescription: string;
	redirectUrl: string;
	metaData?: Record<string, unknown>;
}

export interface InitTransactionResult {
	success: boolean;
	checkoutUrl?: string;
	transactionReference?: string;
	error?: string;
}

/**
 * Initialize a Monnify transaction server-side.
 * Returns a hosted checkoutUrl — no keys are ever sent to the browser.
 */
export async function initializeTransaction(
	params: InitTransactionParams
): Promise<InitTransactionResult> {
	try {
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
					customerName: params.customerName,
					customerEmail: params.customerEmail,
					paymentReference: params.paymentReference,
					paymentDescription: params.paymentDescription,
					currencyCode: 'NGN',
					contractCode: MONNIFY_CONTRACT_CODE,
					redirectUrl: params.redirectUrl,
					metaData: params.metaData
				})
			}
		);

		const data = await response.json();

		if (!data.requestSuccessful || !data.responseBody?.checkoutUrl) {
			return {
				success: false,
				error: data.responseMessage || 'Failed to initialize transaction'
			};
		}

		return {
			success: true,
			checkoutUrl: data.responseBody.checkoutUrl,
			transactionReference: data.responseBody.transactionReference
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}
