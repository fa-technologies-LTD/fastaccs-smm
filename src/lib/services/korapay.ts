import { KORAPAY_SECRET_KEY } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { createHmac } from 'crypto';
import { dev } from '$app/environment';

const KORAPAY_API_URL = 'https://api.korapay.com/merchant/api/v1';

const BASE_URL = dev ? ' https://matha-excursionary-veraciously.ngrok-free.dev' : PUBLIC_BASE_URL;

export interface InitializeChargeParams {
	email: string;
	amount: number; // Amount in kobo (smallest currency unit)
	reference: string;
	metadata?: Record<string, unknown>;
	redirectUrl?: string;
	narration?: string;
}

export interface ChargeVerificationResult {
	success: boolean;
	reference: string;
	amount: number;
	currency: string;
	status: string;
	paidAt?: Date;
	channel?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Initialize a charge with Korapay
 * @param params Charge initialization parameters
 * @returns Checkout URL and reference
 */
export async function initializeCharge(params: InitializeChargeParams) {
	try {
		const payload = {
			amount: params.amount,
			currency: 'NGN',
			reference: params.reference,
			redirect_url: params.redirectUrl || `${BASE_URL}/checkout/verify`,
			notification_url: `${BASE_URL}/api/webhooks/korapay`,
			narration: params.narration || 'Payment',
			merchant_bears_cost: true,
			customer: {
				email: params.email
			},
			metadata: params.metadata || {},
			channels: ['card', 'bank_transfer', 'pay_with_bank', 'mobile_money']
		};

		const response = await fetch(`${KORAPAY_API_URL}/charges/initialize`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${KORAPAY_SECRET_KEY}`
			},
			body: JSON.stringify(payload)
		});

		const data = await response.json();

		if (data.status && data.data?.checkout_url) {
			return {
				success: true,
				checkoutUrl: data.data.checkout_url,
				reference: data.data.reference
			};
		}

		return {
			success: false,
			error: data.message || 'Failed to initialize charge'
		};
	} catch (error) {
		console.error('Korapay initialization error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		};
	}
}

/**
 * Verify a charge with Korapay
 * @param reference Charge reference to verify
 * @returns Charge verification result
 */
export async function verifyCharge(reference: string): Promise<ChargeVerificationResult> {
	try {
		const response = await fetch(`${KORAPAY_API_URL}/charges/${encodeURIComponent(reference)}`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${KORAPAY_SECRET_KEY}`
			}
		});

		const result = await response.json();

		if (result.status && result.data) {
			const data = result.data;

			return {
				success: data.status === 'success',
				reference: data.reference,
				amount: parseFloat(data.amount), // Korapay returns amount as string
				currency: data.currency,
				status: data.status,
				paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
				channel: data.payment_method,
				metadata: data.metadata
			};
		}

		return {
			success: false,
			reference,
			amount: 0,
			currency: 'NGN',
			status: 'failed'
		};
	} catch (error) {
		console.error('Korapay verification error:', error);
		return {
			success: false,
			reference,
			amount: 0,
			currency: 'NGN',
			status: 'error'
		};
	}
}

/**
 * Verify webhook signature from Korapay
 * Korapay signs only the 'data' object in the webhook payload
 * @param signature Signature from x-korapay-signature header
 * @param dataObject The 'data' object from webhook payload
 * @returns Whether signature is valid
 */
export function verifyWebhookSignature(signature: string, dataObject: unknown): boolean {
	try {
		const hash = createHmac('sha256', KORAPAY_SECRET_KEY)
			.update(JSON.stringify(dataObject))
			.digest('hex');
		return hash === signature;
	} catch (error) {
		console.error('Webhook signature verification error:', error);
		return false;
	}
}

/**
 * Convert amount from Naira to Kobo
 * @param naira Amount in Naira
 * @returns Amount in Kobo
 */
export function nairaToKobo(naira: number): number {
	return Math.round(naira * 100);
}

/**
 * Convert amount from Kobo to Naira
 * @param kobo Amount in Kobo
 * @returns Amount in Naira
 */
export function koboToNaira(kobo: number): number {
	return kobo / 100;
}
