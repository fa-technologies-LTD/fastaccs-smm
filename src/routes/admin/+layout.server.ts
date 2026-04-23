import { redirect, error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Check if user is authenticated
	if (!locals.user || !locals.session) {
		throw redirect(303, `/auth/login?redirectTo=${encodeURIComponent(url.pathname)}`);
	}

	// Check if user has admin access context
	if (!locals.adminContext) {
		throw error(403, {
			message: 'Access denied. Admin privileges required.'
		});
	}

	const featureFlags = await getFeatureFlagSnapshot().catch(() => ({
		adminPromotions: false,
		adminAnnouncementBanner: false,
		adminAdvancedAnalytics: true,
		adminRoleManagement: true,
		adminStoreControls: true
	}));

	return {
		user: locals.user,
		session: locals.session,
		isAdmin: true,
		adminRole: locals.adminContext.role,
		adminPermissions: locals.adminContext.permissions,
		canViewRevenue: locals.adminContext.canViewRevenue,
		featureFlags
	};
};
