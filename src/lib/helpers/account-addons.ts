export interface AccountFollowerAddon {
	key: 'followers_100' | 'followers_500' | 'followers_1000';
	label: string;
	followerCount: number;
	priceDelta: number;
}

export const VERIFIED_X_FOLLOWER_ADDONS: readonly AccountFollowerAddon[] = [
	{ key: 'followers_100', label: '+100 followers', followerCount: 100, priceDelta: 4_000 },
	{ key: 'followers_500', label: '+500 followers', followerCount: 500, priceDelta: 12_000 },
	{ key: 'followers_1000', label: '+1,000 followers', followerCount: 1_000, priceDelta: 19_000 }
] as const;

interface VerifiedXAddonContext {
	platformSlug: unknown;
	deliveryMode: unknown;
}

export function hasVerifiedXFollowerAddons(
	metadata: unknown,
	context?: VerifiedXAddonContext
): boolean {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
	if ((metadata as Record<string, unknown>).verified_x_follower_addons !== true) return false;
	if (!context) return true;
	const platformSlug = String(context.platformSlug || '')
		.trim()
		.toLowerCase();
	return (
		(platformSlug === 'x' || platformSlug === 'twitter') &&
		String(context.deliveryMode || '')
			.trim()
			.toLowerCase() === 'manual_handover'
	);
}

export function getVerifiedXFollowerAddon(
	metadata: unknown,
	key: unknown,
	context?: VerifiedXAddonContext
): AccountFollowerAddon | null {
	if (!hasVerifiedXFollowerAddons(metadata, context) || typeof key !== 'string') return null;
	return VERIFIED_X_FOLLOWER_ADDONS.find((option) => option.key === key) || null;
}

export function formatAccountAddonProductName(
	baseName: string,
	addon: AccountFollowerAddon
): string {
	return `${baseName} (${addon.label})`;
}
