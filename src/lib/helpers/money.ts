/** Non-negative NGN amount, preserving kobo. Financial values are not catalogue prices. */
export function moneyNgn(value: unknown): number {
	const amount = Number(value ?? 0);
	return Number.isFinite(amount) && amount > 0
		? Math.round((amount + Number.EPSILON) * 100) / 100
		: 0;
}
