import Paystack from 'paystack-node';
import { PAYSTACK_SECRET_KEY } from '$env/static/private';
import { PUBLIC_BASE_URL } from '$env/static/public';
import { createHmac } from 'crypto';

// Initialize Paystack with secret key
const paystack = new Paystack(PAYSTACK_SECRET_KEY);

export interface InitializePaymentParams {
	email: string;
	amount: number; // in kobo (smallest currency unit)
	orderId: string;
	metadata?: Record<string, unknown>;
}

export interface PaymentVerificationResult {
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
 * Initialize a payment transaction with Paystack
 * @param params Payment initialization parameters
 * @returns Authorization URL and reference
 */
export async function initializePayment(params: InitializePaymentParams) {
	try {
		const response = await paystack.transaction.initialize({
			email: params.email,
			amount: params.amount, // Amount in kobo (e.g., 10000 = ₦100)
			reference: `ORDER-${params.orderId}-${Date.now()}`,
			callback_url: `${PUBLIC_BASE_URL || 'http://localhost:5173'}/checkout/verify`,
			metadata: {
				orderId: params.orderId,
				...params.metadata
			},
			channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer']
		});

		if (response.status && response.data) {
			return {
				success: true,
				authorizationUrl: response.data.authorization_url,
				accessCode: response.data.access_code,
				reference: response.data.reference
			};
		}

		return {
			success: false,
			error: 'Failed to initialize payment'
		};
	} catch (error) {
		console.error('Paystack initialization error:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		};
	}
}

/**
 * Verify a payment transaction
 * @param reference Payment reference to verify
 * @returns Payment verification result
 */
export async function verifyPayment(reference: string): Promise<PaymentVerificationResult> {
	try {
		const response = await paystack.transaction.verify(reference);

		if (response.status && response.data) {
			const data = response.data;

			return {
				success: data.status === 'success',
				reference: data.reference,
				amount: data.amount / 100, // Convert from kobo to naira
				currency: data.currency,
				status: data.status,
				paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
				channel: data.channel,
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
		console.error('Paystack verification error:', error);
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
 * Verify webhook signature from Paystack
 * @param signature Signature from request header
 * @param body Request body
 * @returns Whether signature is valid
 */
export function verifyWebhookSignature(signature: string, body: string): boolean {
	const hash = createHmac('sha512', PAYSTACK_SECRET_KEY).update(body).digest('hex');

	return hash === signature;
}

/**
 * Convert amount from Naira to Kobo (Paystack expects amounts in kobo)
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
