import type { LayoutServerLoad } from './$types';
import { getActiveAnnouncementBanner } from '$lib/services/announcement-banner';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	const isStorefrontPath = !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/auth');
	let announcementBanner: Awaited<ReturnType<typeof getActiveAnnouncementBanner>> = null;

	if (isStorefrontPath) {
		try {
			const flags = await getFeatureFlagSnapshot();
			if (flags.adminAnnouncementBanner) {
				const candidate = await getActiveAnnouncementBanner();
				if (candidate) {
					const dismissed = candidate.dismissible && cookies.get(candidate.dismissCookieName) === '1';
					if (!dismissed) {
						announcementBanner = candidate;
					}
				}
			}
		} catch (error) {
			console.error('Failed to resolve announcement banner:', error);
		}
	}

	// Pass user, session, path, and storefront banner data to all pages
	return {
		user: locals.user,
		session: locals.session,
		currentPath: url.pathname,
		announcementBanner
	};
};
