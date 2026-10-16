import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { prisma } from '$lib/prisma';
import {
	PASSWORD_RESET_COOKIE,
	PASSWORD_RESET_TTL_MS,
	readPasswordResetUserId,
	verifyPasswordResetToken
} from '$lib/server/password-reset';

export const load: PageServerLoad = async ({ url, cookies, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });

	// The emailed link lands here once: keep its code in an httpOnly cookie and continue on a clean
	// URL, before any page script runs, so analytics and Referer headers never see the code.
	const fromLink = url.searchParams.get('token');
	if (fromLink !== null) {
		if (readPasswordResetUserId(fromLink)) {
			cookies.set(PASSWORD_RESET_COOKIE, fromLink, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: url.protocol === 'https:',
				maxAge: Math.floor(PASSWORD_RESET_TTL_MS / 1000)
			});
		} else {
			cookies.delete(PASSWORD_RESET_COOKIE, { path: '/' });
		}
		throw redirect(303, '/auth/reset-password');
	}

	const token = cookies.get(PASSWORD_RESET_COOKIE) ?? null;
	const userId = readPasswordResetUserId(token);
	const user = userId
		? await prisma.user.findUnique({
				where: { id: userId },
				select: { id: true, email: true, passwordHash: true, isActive: true }
			})
		: null;
	return {
		valid: Boolean(user?.isActive && user.passwordHash && verifyPasswordResetToken(token, user))
	};
};
