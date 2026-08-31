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

const AFFILIATE_POPUP_CONTENT: Record<AffiliatePopupType, AffiliatePopupContent> = {
	welcome: {
		icon: '👋',
		title: 'Welcome to the Affiliate Program',
		body: 'Refer friends and earn real, withdrawable cash when their eligible account orders are retained. Make your first purchase to unlock your referral code.',
		ctaText: 'Got it',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	// progress_50 / progress_80 slots are repurposed for payout progress (30% / 80%).
	progress_50: {
		icon: '🚀',
		title: "You're 30% of the way to your first payout",
		body: 'Your referral earnings are adding up. Keep sharing your code to reach the payout minimum.',
		ctaText: 'Keep going',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	progress_80: {
		icon: '🔥',
		title: "You're 80% of the way to your first payout",
		body: 'Almost there! A little more and you can withdraw your available affiliate earnings to your approved bank account.',
		ctaText: 'Almost there',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	// Retired: the 95% slot is no longer triggered (payout uses 30% / 80% only).
	progress_95: {
		icon: '⚡',
		title: "You're almost at your payout",
		body: "You're nearly at the payout minimum — add your bank details so you're ready to withdraw.",
		ctaText: 'Got it',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	unlocked: {
		icon: '🎉',
		title: 'Your first earning is ready',
		body: "Add the bank account where we'll send payouts when you choose to withdraw. We only use these details to pay your affiliate earnings—never to charge or debit you.",
		ctaText: 'Add bank details',
		ctaHref: '/affiliate/bank-details',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	},
	share_code: {
		icon: '💸',
		title: "You're all set to earn!",
		body: 'Share your referral code below. Friends save 5% on their first two eligible account orders, and you earn 5% too — up to ₦1,000 per order.',
		ctaText: 'Show my referral code',
		secondaryHref: HOW_IT_WORKS_HREF,
		secondaryText: HOW_IT_WORKS_TEXT
	}
};

export function getAffiliatePopupContent(
	type: AffiliatePopupType,
	payoutMinimum: number,
	regularPolicy: {
		buyerDiscountPercent: number;
		affiliateRewardPercent: number;
		orderLimit: number;
		perOrderCap: number;
	} = {
		buyerDiscountPercent: 5,
		affiliateRewardPercent: 5,
		orderLimit: 2,
		perOrderCap: 1_000
	}
): AffiliatePopupContent {
	const base = AFFILIATE_POPUP_CONTENT[type];
	const formattedMinimum = `₦${Math.max(0, Number(payoutMinimum || 0)).toLocaleString()}`;

	if (type === 'progress_50') {
		return {
			...base,
			body: `Your referral earnings are adding up — you're 30% of the way to the ${formattedMinimum} payout minimum. Keep sharing your code!`
		};
	}
	if (type === 'progress_80') {
		return {
			...base,
			body: `Almost there! A little more and you'll hit the ${formattedMinimum} minimum and can withdraw your available affiliate earnings.`
		};
	}
	if (type === 'progress_95') {
		return {
			...base,
			body: `You're nearly at the ${formattedMinimum} payout minimum — add your bank details so you're ready to withdraw.`
		};
	}
	if (type === 'share_code') {
		return {
			...base,
			body: `Share your referral code below. Friends save ${regularPolicy.buyerDiscountPercent}% on their first ${regularPolicy.orderLimit} eligible account orders, and you earn ${regularPolicy.affiliateRewardPercent}% too—up to ₦${regularPolicy.perOrderCap.toLocaleString()} per order.`
		};
	}

	return base;
}
