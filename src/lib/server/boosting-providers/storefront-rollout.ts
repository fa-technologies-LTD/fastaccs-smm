export const BOOSTING_MANAGED_STOREFRONT_KEY = 'config.boosting.managed_storefront_enabled';

export function isBoostingManagedStorefrontEnabled(
	row: { value: string; isActive: boolean } | null,
	hasEligibleLiveOffers: boolean
): boolean {
	return (
		hasEligibleLiveOffers || (row?.isActive === true && row.value.trim().toLowerCase() === 'true')
	);
}
