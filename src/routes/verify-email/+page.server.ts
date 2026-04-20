import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { maskEmailAddress } from '$lib/services/email';

function sanitizeNextPath(input: string | null): string {
	if (!input) return '/dashboard';
	const trimmed = input.trim();
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return '/dashboard';
	return trimmed;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) {
		throw redirect(302, `/auth/login?returnUrl=${encodeURIComponent(url.pathname + url.search)}`);
	}

	const next = sanitizeNextPath(url.searchParams.get('next'));
	if (locals.user.emailVerified) {
		throw redirect(302, next);
	}

	return {
		next,
		maskedEmail: maskEmailAddress(locals.user.email || ''),
		email: locals.user.email || ''
	};
};
