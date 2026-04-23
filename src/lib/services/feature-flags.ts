import { prisma } from '$lib/prisma';

export const FEATURE_FLAG_KEYS = {
	adminPromotions: 'feature.admin_promotions.enabled',
	adminAnnouncementBanner: 'feature.admin_announcement_banner.enabled',
	adminAdvancedAnalytics: 'feature.admin_advanced_analytics.enabled',
	adminRoleManagement: 'feature.admin_role_management.enabled',
	adminStoreControls: 'feature.admin_store_controls.enabled'
} as const;

export interface FeatureFlagSnapshot {
	adminPromotions: boolean;
	adminAnnouncementBanner: boolean;
	adminAdvancedAnalytics: boolean;
	adminRoleManagement: boolean;
	adminStoreControls: boolean;
}

const DEFAULT_FLAGS: FeatureFlagSnapshot = {
	adminPromotions: true,
	adminAnnouncementBanner: false,
	adminAdvancedAnalytics: true,
	adminRoleManagement: true,
	adminStoreControls: true
};

function parseBooleanFlag(value: string | null | undefined, fallback: boolean): boolean {
	if (!value) return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export async function getFeatureFlagSnapshot(): Promise<FeatureFlagSnapshot> {
	const keys = Object.values(FEATURE_FLAG_KEYS);
	const rows = await prisma.microcopy.findMany({
		where: { key: { in: keys } },
		select: { key: true, value: true }
	});

	const valueByKey = new Map(rows.map((row) => [row.key, row.value]));

	return {
		adminPromotions: parseBooleanFlag(
			valueByKey.get(FEATURE_FLAG_KEYS.adminPromotions),
			DEFAULT_FLAGS.adminPromotions
		),
		adminAnnouncementBanner: parseBooleanFlag(
			valueByKey.get(FEATURE_FLAG_KEYS.adminAnnouncementBanner),
			DEFAULT_FLAGS.adminAnnouncementBanner
		),
		adminAdvancedAnalytics: parseBooleanFlag(
			valueByKey.get(FEATURE_FLAG_KEYS.adminAdvancedAnalytics),
			DEFAULT_FLAGS.adminAdvancedAnalytics
		),
		adminRoleManagement: parseBooleanFlag(
			valueByKey.get(FEATURE_FLAG_KEYS.adminRoleManagement),
			DEFAULT_FLAGS.adminRoleManagement
		),
		adminStoreControls: parseBooleanFlag(
			valueByKey.get(FEATURE_FLAG_KEYS.adminStoreControls),
			DEFAULT_FLAGS.adminStoreControls
		)
	};
}

export async function saveFeatureFlags(next: Partial<FeatureFlagSnapshot>): Promise<void> {
	const snapshot = {
		...DEFAULT_FLAGS,
		...next
	};

	await Promise.all(
		(Object.entries(snapshot) as Array<[keyof FeatureFlagSnapshot, boolean]>).map(([key, value]) =>
			prisma.microcopy.upsert({
				where: {
					key:
						key === 'adminPromotions'
							? FEATURE_FLAG_KEYS.adminPromotions
							: key === 'adminAnnouncementBanner'
								? FEATURE_FLAG_KEYS.adminAnnouncementBanner
								: key === 'adminAdvancedAnalytics'
									? FEATURE_FLAG_KEYS.adminAdvancedAnalytics
									: key === 'adminRoleManagement'
										? FEATURE_FLAG_KEYS.adminRoleManagement
										: FEATURE_FLAG_KEYS.adminStoreControls
				},
				update: {
					value: value ? 'true' : 'false',
					category: 'settings',
					description: `Feature flag for ${key}.`,
					isActive: true
				},
				create: {
					key:
						key === 'adminPromotions'
							? FEATURE_FLAG_KEYS.adminPromotions
							: key === 'adminAnnouncementBanner'
								? FEATURE_FLAG_KEYS.adminAnnouncementBanner
								: key === 'adminAdvancedAnalytics'
									? FEATURE_FLAG_KEYS.adminAdvancedAnalytics
									: key === 'adminRoleManagement'
										? FEATURE_FLAG_KEYS.adminRoleManagement
										: FEATURE_FLAG_KEYS.adminStoreControls,
					value: value ? 'true' : 'false',
					category: 'settings',
					description: `Feature flag for ${key}.`,
					isActive: true
				}
			})
		)
	);
}
