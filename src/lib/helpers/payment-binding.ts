interface PaymentBindingInput {
	orderId: string;
	metadataOrderId: string | null;
	storedPaymentReference: string | null;
	verifiedPaymentReference: string | null;
}

export function isVerifiedPaymentBoundToOrder(input: PaymentBindingInput): boolean {
	const metadataMatchesOrder = input.metadataOrderId === input.orderId;
	const referencesConflict =
		Boolean(input.storedPaymentReference && input.verifiedPaymentReference) &&
		input.storedPaymentReference !== input.verifiedPaymentReference;

	if (referencesConflict) return false;
	if (metadataMatchesOrder) return true;

	return Boolean(
		input.storedPaymentReference &&
			input.verifiedPaymentReference &&
			input.storedPaymentReference === input.verifiedPaymentReference
	);
}
