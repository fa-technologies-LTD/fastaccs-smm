import {
	verifyTransaction,
	verifyWebhookSignature as verifyMonnifyWebhookSignature
} from './monnify';
import type { TransactionVerificationResult } from './monnify';

export interface PaymentVerificationResult {
	success: boolean;
	transactionReference: string;
	paymentReference: string;
	amount: number;
	amountPaid: number;
	currency: string;
	status: string;
	paidAt?: Date;
	channel?: string;
	metaData?: Record<string, unknown>;
}

/**
 * Verify a payment transaction with Monnify
 * @param transactionReference Monnify's internal transaction reference
 */
export async function verifyPayment(
	transactionReference: string
): Promise<PaymentVerificationResult> {
	const result: TransactionVerificationResult = await verifyTransaction(transactionReference);

	return {
		success: result.success,
		transactionReference: result.transactionReference,
		paymentReference: result.paymentReference,
		amount: result.amount,
		amountPaid: result.amountPaid,
		currency: result.currency,
		status: result.paymentStatus,
		paidAt: result.paidOn,
		channel: result.paymentMethod,
		metaData: result.metaData
	};
}

/**
 * Verify webhook signature from Monnify
 * @param signature Value from `monnify-signature` header
 * @param rawBody Raw request body string
 */
export function verifyWebhookSignature(signature: string, rawBody: string): boolean {
	return verifyMonnifyWebhookSignature(signature, rawBody);
}
