/** A rental terminal label alone does not prove that the customer's credit was posted. */
export function isPhoneRefundConfirmed(
	rental: { refundedAt?: unknown; saleAmountNgn?: unknown } | null | undefined,
	order: { userId?: string | null; refundedAmount?: unknown }
): boolean {
	const sale = Number(rental?.saleAmountNgn);
	return Boolean(
		rental?.refundedAt &&
			order.userId &&
			Number.isFinite(sale) &&
			sale > 0 &&
			Number(order.refundedAmount) >= sale
	);
}
