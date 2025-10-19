import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Get redirect URL from query params
	const returnUrl = url.searchParams.get('returnUrl') || '/dashboard';

	return {
		user: locals.user,
		returnUrl
	};
};
