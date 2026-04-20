import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const returnUrl = url.searchParams.get('returnUrl') || '/dashboard';

	if (locals.user) {
		if (locals.user.emailVerified) {
			throw redirect(302, returnUrl);
		}
		throw redirect(302, `/verify-email?next=${encodeURIComponent(returnUrl)}`);
	}

	return {
		user: locals.user,
		returnUrl
	};
};
