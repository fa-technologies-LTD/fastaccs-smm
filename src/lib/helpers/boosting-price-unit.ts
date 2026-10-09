/** Price each quantity increment precisely; round only the final customer total to ₦50. */
export function suggestBoostingPricePerStep(input: {
	supplierCostNgn: number;
	quantity: number;
	stepQuantity: number;
	profitPercent: number;
}): number {
	if (
		![input.supplierCostNgn, input.quantity, input.stepQuantity, input.profitPercent].every(
			Number.isFinite
		) ||
		input.supplierCostNgn <= 0 ||
		input.quantity <= 0 ||
		input.stepQuantity <= 0
	)
		return 0;
	const value =
		(input.supplierCostNgn *
			(1 + Math.min(500, Math.max(0, input.profitPercent)) / 100) *
			input.stepQuantity) /
		input.quantity;
	return Math.max(0.01, Math.ceil((value - 1e-9) * 100) / 100);
}

/** Preserve the unit price of a locked offer when its quantity increment changes.
 * Return null rather than silently round an owner's price to a different unit rate.
 */
export function rebaseLockedBoostingPrice(
	pricePerStepNgn: number,
	previousStep: number,
	nextStep: number
): number | null {
	if (
		!Number.isFinite(pricePerStepNgn) ||
		pricePerStepNgn <= 0 ||
		!Number.isSafeInteger(previousStep) ||
		previousStep <= 0 ||
		!Number.isSafeInteger(nextStep) ||
		nextStep <= 0
	)
		return null;
	const previousKobo = Math.round(pricePerStepNgn * 100);
	if (!Number.isSafeInteger(previousKobo) || Math.abs(previousKobo - pricePerStepNgn * 100) > 1e-7)
		return null;
	const numerator = BigInt(previousKobo) * BigInt(nextStep);
	const denominator = BigInt(previousStep);
	if (numerator % denominator !== 0n) return null;
	const nextKobo = Number(numerator / denominator);
	return Number.isSafeInteger(nextKobo) && nextKobo > 0 ? nextKobo / 100 : null;
}
