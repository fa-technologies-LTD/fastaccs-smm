import {
	initializeCharge,
	verifyCharge,
	
	
	verifyWebhookSignature as verifyKorapayWebhookSignature,
	nairaToKobo as convertNairaToKobo,
	koboToNaira as convertKoboToNaira
} from './korapay';

export interface InitializePaymentParams {
	email: string;
	amount: number; // in kobo (smallest currency unit)
	reference?: string;
	metadata?: Record<string, unknown>;
	narration?: string;
	redirectUrl?: string;
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
 * Initialize a payment transaction with Korapay
 * @param params Payment initialization parameters
 * @returns Authorization URL and reference
 */
export async function initializePayment(params: InitializePaymentParams) {
	const reference =
		params.reference || `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

	const result = await initializeCharge({
		email: params.email,
		amount: params.amount,
		reference,
		metadata: params.metadata,
		narration: params.narration,
		redirectUrl: params.redirectUrl
	});

	if (result.success) {
		return {
			success: true,
			authorizationUrl: result.checkoutUrl,
			reference: result.reference
		};
	}

	return {
		success: false,
		error: result.error || 'Failed to initialize payment'
	};
}

/**
 * Verify a payment transaction
 * @param reference Payment reference to verify
 * @returns Payment verification result
 */
export async function verifyPayment(reference: string): Promise<PaymentVerificationResult> {
	return await verifyCharge(reference);
}

/**
 * Verify webhook signature from Korapay
 * @param signature Signature from request header
 * @param dataObject The 'data' object from webhook payload
 * @returns Whether signature is valid
 */
export function verifyWebhookSignature(signature: string, dataObject: unknown): boolean {
	return verifyKorapayWebhookSignature(signature, dataObject);
}

/**
 * Convert amount from Naira to Kobo
 * @param naira Amount in Naira
 * @returns Amount in Kobo
 */
export function nairaToKobo(naira: number): number {
	return convertNairaToKobo(naira);
}

/**
 * Convert amount from Kobo to Naira
 * @param kobo Amount in Kobo
 * @returns Amount in Naira
 */
export function koboToNaira(kobo: number): number {
	return convertKoboToNaira(kobo);
}
