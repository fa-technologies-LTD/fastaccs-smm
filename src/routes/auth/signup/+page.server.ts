import { redirect } from '@sveltejs/kit';
import { sanitizeInternalRedirectPath } from '$lib/auth/redirect';
import { toBrowserUser } from '$lib/auth/browser-session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const returnUrl = sanitizeInternalRedirectPath(url.searchParams.get('returnUrl'));

	if (locals.user) {
		if (locals.user.emailVerified) {
			throw redirect(302, returnUrl);
		}
		throw redirect(302, `/verify-email?next=${encodeURIComponent(returnUrl)}`);
	}

	return {
		user: toBrowserUser(locals.user),
		returnUrl
	};
};
