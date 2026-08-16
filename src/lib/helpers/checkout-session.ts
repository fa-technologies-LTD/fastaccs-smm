export interface CheckoutFingerprintItem {
	id: string;
	tierId: string;
	quantity: number;
	exactAccountId: string | null;
}

export interface CheckoutFingerprintInput {
	userId: string | null;
	items: CheckoutFingerprintItem[];
	affiliateCode: string | null;
	promotionCode: string | null;
	total: number;
	useStoreCredit: boolean;
	storeCreditApplied: number;
	payableTotal: number;
}

/**
 * A checkout key is only reusable when both the cart and the payment intent match.
 * In particular, a hosted gateway checkout must never be resumed after the buyer
 * switches the same cart to store credit (or vice versa).
 */
export function buildCheckoutFingerprint(input: CheckoutFingerprintInput): string {
	return JSON.stringify({
		userId: input.userId,
		items: input.items,
		affiliateCode: input.affiliateCode,
		promotionCode: input.promotionCode,
		total: input.total,
		useStoreCredit: input.useStoreCredit,
		storeCreditApplied: input.storeCreditApplied,
		payableTotal: input.payableTotal
	});
}
