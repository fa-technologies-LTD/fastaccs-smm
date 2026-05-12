import { sanitizeInternalRedirectPath } from '$lib/auth/redirect';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Get redirect URL from query params
	const returnUrl = sanitizeInternalRedirectPath(url.searchParams.get('returnUrl'));

	return {
		user: locals.user,
		returnUrl
	};
};
