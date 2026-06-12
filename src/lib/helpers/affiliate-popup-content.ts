import type { AffiliatePopupType } from '$lib/services/affiliate';

export interface AffiliatePopupContent {
	icon: string;
	title: string;
	body: string;
	ctaText: string;
	secondaryHref: string;
	secondaryText: string;
}

const HOW_IT_WORKS_HREF = '/how-it-works?tab=affiliate';
const HOW_IT_WORKS_TEXT = 'See how it works';

export const AFFILIATE_POPUP_CONTENT: Record<AffiliatePopupType, AffiliatePopupContent> = {
	welcome: {
		icon: '👋',
		title: 'Welcome to the Affiliate Program',
		body: 'Refer friends and earn real, withdrawable cash on their orders. Keep shopping to unlock your referral code.',
		ctaText: 'Got it',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	progress_50: {
		icon: '🚀',
		title: "You're 50% of the way there",
		body: "You're halfway to unlocking your referral code and earning real cash from referrals. Keep going!",
		ctaText: 'Keep going',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	progress_80: {
		icon: '🔥',
		title: "You're 80% of the way there",
		body: "Almost there! A little more and you'll unlock your referral code and start earning real cash from referrals.",
		ctaText: 'Almost there',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	progress_95: {
		icon: '⚡',
		title: 'Almost unlocked — 95%!',
		body: "One more step and your referral code is live, real cash earnings included.",
		ctaText: 'Got it',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	unlocked: {
		icon: '🎉',
		title: "You're unlocked!",
		body: 'You can now earn real cash from your referrals. Activate your code, share your link, and start earning.',
		ctaText: 'Got it',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	}
};
