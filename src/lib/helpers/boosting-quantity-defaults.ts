/** Draft-only quantity defaults. Applying them never changes an existing purchase. */
export function standardBoostQuantityDefaults(outcome: string, supplierMinimum = 1) {
	const step =
		outcome === 'comments' || outcome === 'custom_comments'
			? 10
			: outcome === 'likes'
				? 200
				: outcome === 'followers'
					? 500
					: null;
	if (step === null) return null;
	if (!Number.isSafeInteger(supplierMinimum) || supplierMinimum < 1) return null;
	const minimum = Math.ceil(Math.max(step, supplierMinimum) / step) * step;
	return Number.isSafeInteger(minimum) ? { minimum, step } : null;
}
