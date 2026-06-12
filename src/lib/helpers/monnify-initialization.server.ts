export const MONNIFY_CURRENCY = 'NGN';

export type MonnifyInitializationIssue = 'invalid_amount' | 'unsupported_currency';

export interface MonnifyInitializationInput {
	amount: number;
	currency: string;
}

export function getMonnifyInitializationIssue({
	amount,
	currency
}: MonnifyInitializationInput): MonnifyInitializationIssue | null {
	if (!Number.isFinite(amount) || amount <= 0) {
		return 'invalid_amount';
	}

	if (
		String(currency || '')
			.trim()
			.toUpperCase() !== MONNIFY_CURRENCY
	) {
		return 'unsupported_currency';
	}

	return null;
}

export function getMonnifyInitializationErrorMessage(issue: MonnifyInitializationIssue): string {
	return issue === 'invalid_amount'
		? 'Payment amount is invalid. Please refresh your cart and try again.'
		: 'This checkout currency is not supported. Please refresh your cart and try again.';
}
