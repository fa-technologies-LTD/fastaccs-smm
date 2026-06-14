import type { LayoutServerLoad } from './$types';
import { getActiveAnnouncementBanner } from '$lib/services/announcement-banner';
import { getFeatureFlagSnapshot } from '$lib/services/feature-flags';
import { toBrowserSession, toBrowserUser } from '$lib/auth/browser-session';

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
	const isStorefrontPath = !url.pathname.startsWith('/admin') && !url.pathname.startsWith('/auth');
	let announcementBanner: Awaited<ReturnType<typeof getActiveAnnouncementBanner>> = null;

	if (isStorefrontPath) {
		try {
			const flags = await getFeatureFlagSnapshot();
			if (flags.adminAnnouncementBanner) {
				const candidate = await getActiveAnnouncementBanner();
				if (candidate) {
					const dismissed =
						candidate.dismissible && cookies.get(candidate.dismissCookieName) === '1';
					if (!dismissed) {
						announcementBanner = candidate;
					}
				}
			}
		} catch (error) {
			console.error('Failed to resolve announcement banner:', error);
		}
	}

	// Only expose the browser-safe subset of authenticated account data.
	return {
		user: toBrowserUser(locals.user),
		session: toBrowserSession(locals.session),
		currentPath: url.pathname,
		announcementBanner
	};
};
