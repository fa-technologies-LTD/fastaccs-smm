import type { AffiliatePopupType } from '$lib/services/affiliate';

export interface AffiliatePopupContent {
	icon: string;
	title: string;
	body: string;
	ctaText: string;
	ctaHref?: string;
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
	// progress_50 / progress_80 slots are repurposed for payout progress (30% / 80%).
	progress_50: {
		icon: '🚀',
		title: "You're 30% of the way to your first payout",
		body: "Your referral earnings are adding up — you're 30% of the way to the ₦10,000 payout minimum. Keep sharing your code!",
		ctaText: 'Keep going',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	progress_80: {
		icon: '🔥',
		title: "You're 80% of the way to your first payout",
		body: "Almost there! A little more and you'll hit the ₦10,000 minimum and can withdraw your affiliate earnings to your bank.",
		ctaText: 'Almost there',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	// Retired: the 95% slot is no longer triggered (payout uses 30% / 80% only).
	progress_95: {
		icon: '⚡',
		title: "You're almost at your payout",
		body: "You're nearly at the ₦10,000 payout minimum — add your bank details so you're ready to withdraw.",
		ctaText: 'Got it',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	unlocked: {
		icon: '🎉',
		title: "You've unlocked affiliate earnings!",
		body: "One quick step before you start earning: add the bank account where we'll send your payouts. We only ever use these details to pay out your affiliate earnings — never to charge or debit you.",
		ctaText: 'Add bank details',
		ctaHref: '/affiliate/bank-details',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	share_code: {
		icon: '💸',
		title: "You're all set to earn!",
		body: 'Your payout account is saved. Now share your referral code below — every friend who buys with it earns you affiliate cash.',
		ctaText: 'Show my referral code',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	}
};
