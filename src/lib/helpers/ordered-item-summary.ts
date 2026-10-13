import { BOOSTING_ACTION_LABELS, BOOSTING_PLATFORM_LABELS } from './boosting-service-config';

function record(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** Display purchased Boosting units, not the cart-line multiplier. Never alters billing. */
export function orderedItemSummary(value: unknown) {
	const item = record(value);
	const category = record(item.category);
	const parent = record(category.parent);
	const metadata = record(category.metadata);
	const fulfillment = record(item.boostFulfillment);
	const isBoosting = Boolean(item.boostTargetUrl) || item.productCategory === 'boosting_service';
	const action = String(fulfillment.outcome || metadata.boosting_action_type || '');
	const platform = String(fulfillment.platform || metadata.boosting_platform || '');
	const actionLabel =
		text((BOOSTING_ACTION_LABELS as Record<string, string>)[action]).toLowerCase() || 'units';
	const rawQuantity = Number(
		isBoosting ? (item.boostQuantity ?? fulfillment.quantity) : item.quantity
	);
	const quantity = Number.isSafeInteger(rawQuantity) && rawQuantity > 0 ? rawQuantity : 0;
	const platformName = isBoosting
		? text((BOOSTING_PLATFORM_LABELS as Record<string, string>)[platform])
		: text(parent.name) || text(item.productCategory);
	return {
		tierName:
			(isBoosting ? text(item.productName) : text(category.name)) ||
			text(category.name) ||
			text(item.productName) ||
			'Unknown item',
		platformName,
		quantity,
		quantityLabel: isBoosting
			? quantity
				? `${quantity.toLocaleString('en-NG')} ${actionLabel}`
				: 'Quantity unavailable'
			: `×${quantity}`
	};
}
