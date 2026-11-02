/**
 * Monnify refused a transfer into an order's payment account. The payment itself stays open, so these
 * sentences only repeat what Monnify reported: its reason and the amounts, never a guess.
 */
export interface DeclinedTransfer {
	/** Monnify's rejectionReason, e.g. UNDER_PAYMENT, OVER_PAYMENT or ACCOUNT_NOT_IN_USE. */
	reason: string | null;
	expectedAmount: number | null;
	amountSent: number | null;
}

const naira = (value: number) =>
	`₦${(Math.round(value * 100) / 100).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

function amount(value: unknown): number | null {
	const n = typeof value === 'string' ? Number(value.trim()) : value;
	return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

export function readDeclinedTransfer(value: unknown): DeclinedTransfer {
	const data =
		value && typeof value === 'object' && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: {};
	const reason = typeof data.reason === 'string' && data.reason.trim() ? data.reason.trim() : null;
	return {
		reason,
		expectedAmount: amount(data.expectedAmount),
		amountSent: amount(data.amountSent)
	};
}

/** For the customer, while the order still waits for payment. */
export function declinedTransferNotice(transfer: DeclinedTransfer): string {
	const sent = transfer.amountSent === null ? null : naira(transfer.amountSent);
	const needed = transfer.expectedAmount === null ? null : naira(transfer.expectedAmount);
	if (transfer.reason === 'UNDER_PAYMENT' || transfer.reason === 'OVER_PAYMENT') {
		if (sent && needed)
			return `Your transfer of ${sent} wasn’t accepted: this order needs exactly ${needed}. You can still pay with Resume payment.`;
		const side = transfer.reason === 'UNDER_PAYMENT' ? 'less' : 'more';
		return `Your transfer wasn’t accepted because it was ${side} than this order’s total. You can still pay the exact amount with Resume payment.`;
	}
	if (transfer.reason === 'ACCOUNT_NOT_IN_USE')
		return 'Your transfer wasn’t accepted because this order’s payment account had already closed. Use Resume payment to pay again.';
	return 'A transfer for this order wasn’t accepted by the payment provider. You can still pay with Resume payment.';
}

/** For the order history admins read. */
export function declinedTransferSummary(transfer: DeclinedTransfer): string {
	const why =
		transfer.reason === 'UNDER_PAYMENT'
			? 'less than the order total'
			: transfer.reason === 'OVER_PAYMENT'
				? 'more than the order total'
				: transfer.reason === 'ACCOUNT_NOT_IN_USE'
					? 'payment account no longer in use'
					: transfer.reason
						? transfer.reason
						: 'no reason given';
	const amounts = [
		transfer.amountSent === null ? null : `sent ${naira(transfer.amountSent)}`,
		transfer.expectedAmount === null ? null : `expected ${naira(transfer.expectedAmount)}`
	]
		.filter(Boolean)
		.join(', ');
	return `Monnify refused a transfer (${why})${amounts ? `: ${amounts}` : ''}. The payment stays open.`;
}
