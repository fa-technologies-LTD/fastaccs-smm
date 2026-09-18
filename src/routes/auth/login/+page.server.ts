import { sanitizeInternalRedirectPath } from '$lib/auth/redirect';
import { toBrowserUser } from '$lib/auth/browser-session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// Accept both names because authenticated route guards use `redirectTo`, while
	// customer-facing login links historically use `returnUrl`.
	const returnUrl = sanitizeInternalRedirectPath(
		url.searchParams.get('returnUrl') ?? url.searchParams.get('redirectTo')
	);

	return {
		user: toBrowserUser(locals.user),
		returnUrl
	};
};
