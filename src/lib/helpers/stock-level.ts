/**
 * One stock rule for every admin page, alert and digest. Low stock means some left but no more than
 * the threshold, so "3 or fewer" means 3 or fewer. Out of stock means none left.
 */
export function isLowStock(available: number, threshold: number): boolean {
	return available > 0 && available <= Math.max(1, threshold);
}

export function isOutOfStock(available: number): boolean {
	return available <= 0;
}
