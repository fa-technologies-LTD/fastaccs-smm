import type { AffiliatePopupType } from '$lib/services/affiliate';

export interface AffiliatePopupContent {
	icon: string;
	title: string;
	body: string;
	ctaText: string;
}

export const AFFILIATE_POPUP_CONTENT: Record<AffiliatePopupType, AffiliatePopupContent> = {
	welcome: {
		icon: '👋',
		title: 'Welcome to the Affiliate Program',
		body: 'Share your referral code so buyers can save at checkout. Once you reach your unlock threshold, you will get your own code and start earning Store Credit from successful referred orders. Store Credit is real, withdrawable cash.',
		ctaText: 'Got it'
	},
	progress_50: {
		icon: '🚀',
		title: "You're 50% of the way there",
		body: "You're halfway to unlocking affiliate access. Keep going, your referral code and Store Credit earnings are getting closer.",
		ctaText: 'Keep going'
	},
	progress_80: {
		icon: '🔥',
		title: "You're 80% of the way there",
		body: "Almost there. A little more spend and you'll unlock your referral code and start earning Store Credit from successful referrals.",
		ctaText: 'Almost there'
	},
	progress_95: {
		icon: '⚡',
		title: 'Almost unlocked — 95%!',
		body: "You're just a step away from unlocking affiliate access and your own referral code.",
		ctaText: 'Got it'
	},
	unlocked: {
		icon: '🎉',
		title: "You're unlocked!",
		body: 'Affiliate access is unlocked. Activate your referral code, share your link, and start earning real, withdrawable Store Credit from successful referred orders.',
		ctaText: 'Got it'
	}
};
