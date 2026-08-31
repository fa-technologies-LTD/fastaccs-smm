import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	clearAffiliateReferralCookie,
	lockReferralAttributionForUser,
	setAffiliateReferralCookie,
	validateAffiliateCode
} from '$lib/services/affiliate';
import { sanitizeInternalRedirectPath } from '$lib/auth/redirect';
import { recordAffiliateEvent } from '$lib/services/affiliate-events';
import { randomUUID } from 'crypto';

export const GET: RequestHandler = async ({ params, cookies, url, locals }) => {
	const normalizedCode = String(params.code || '')
		.trim()
		.toUpperCase();
	const fallbackNext = '/platforms';
	const next = sanitizeInternalRedirectPath(url.searchParams.get('next'), fallbackNext);
	const isSecureRequest = url.protocol === 'https:';

	if (!normalizedCode) {
		clearAffiliateReferralCookie(cookies, isSecureRequest);
		throw redirect(302, next);
	}

	const validation = await validateAffiliateCode(normalizedCode);
	if (!validation.valid || !validation.userId) {
		clearAffiliateReferralCookie(cookies, isSecureRequest);
		const target = next.includes('?') ? `${next}&ref=invalid` : `${next}?ref=invalid`;
		throw redirect(302, target);
	}

	if (locals.user?.id && locals.user.id === validation.userId) {
		throw redirect(302, '/dashboard?tab=affiliate');
	}

	await recordAffiliateEvent({
		type: 'referral_link_opened',
		dedupeKey: `affiliate:link_opened:${validation.affiliateProgramId}:${locals.user?.id || randomUUID()}:${new Date().toISOString().slice(0, 10)}`,
		affiliateProgramId: validation.affiliateProgramId,
		affiliateUserId: validation.userId,
		referredUserId: locals.user?.id || null,
		source: 'referral_link',
		metadata: { destination: next, authenticated: Boolean(locals.user?.id) }
	}).catch((error) => console.error('Failed to record affiliate link-open event:', error));

	if (locals.user?.id) {
		await lockReferralAttributionForUser({
			referredUserId: locals.user.id,
			affiliateCode: normalizedCode,
			source: 'checkout_link'
		});
	}

	setAffiliateReferralCookie(cookies, normalizedCode, isSecureRequest);
	throw redirect(302, next);
};
