import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/prisma', () => ({
	prisma: {}
}));

vi.mock('$lib/services/email', () => ({
	sendEmail: vi.fn(),
	sendMarketingEmail: vi.fn()
}));

vi.mock('$lib/services/affiliate-notification-email', () => ({
	sendAffiliateUnlockEmailIfNeeded: vi.fn(),
	sendFirstStoreCreditEmailIfNeeded: vi.fn()
}));

vi.mock('$lib/services/affiliate-payout-email', () => ({
	sendAffiliatePayoutStatusEmailIfNeeded: vi.fn()
}));

vi.mock('$lib/services/admin-settings', () => ({
	getOperationalAlertRecipients: vi.fn()
}));

import { getPendingAffiliatePopup, PROGRESS_MILESTONES } from './affiliate';

const NO_POPUPS_SEEN = {
	welcome: null,
	progress50: null,
	progress80: null,
	progress95: null,
	unlocked: null,
	shareCode: null
};
const SEEN = new Date('2026-01-01T00:00:00.000Z');

describe('getPendingAffiliatePopup', () => {
	it('returns the email progress milestones in descending order', () => {
		expect(PROGRESS_MILESTONES).toEqual([95, 80, 50]);
	});

	it('returns null when the admin kill-switch is off, even if popups would otherwise apply', () => {
		const result = getPendingAffiliatePopup({
			unlocked: true,
			hasBankDetails: false,
			spendProgressPercent: 100,
			popupsEnabled: false,
			seenAt: NO_POPUPS_SEEN
		});

		expect(result).toBeNull();
	});

	it('shows the bank-details (KYC) unlock pop-up first when no payout details are saved', () => {
		const result = getPendingAffiliatePopup({
			unlocked: true,
			hasBankDetails: false,
			spendProgressPercent: 100,
			popupsEnabled: true,
			seenAt: NO_POPUPS_SEEN
		});

		expect(result).toBe('unlocked');
	});

	it('shows the share-code pop-up once bank details are saved', () => {
		const result = getPendingAffiliatePopup({
			unlocked: true,
			hasBankDetails: true,
			spendProgressPercent: 100,
			popupsEnabled: true,
			seenAt: { ...NO_POPUPS_SEEN, unlocked: SEEN }
		});

		expect(result).toBe('share_code');
	});

	it('does not repeat the share-code pop-up once it has been seen', () => {
		const result = getPendingAffiliatePopup({
			unlocked: true,
			hasBankDetails: true,
			spendProgressPercent: 100,
			popupsEnabled: true,
			seenAt: { ...NO_POPUPS_SEEN, unlocked: SEEN, shareCode: SEEN }
		});

		expect(result).not.toBe('share_code');
	});

	it('shows the welcome pop-up to a brand-new user with no spend', () => {
		const result = getPendingAffiliatePopup({
			unlocked: false,
			hasBankDetails: false,
			spendProgressPercent: 0,
			popupsEnabled: true,
			seenAt: NO_POPUPS_SEEN
		});

		expect(result).toBe('welcome');
	});

	it('shows the highest applicable milestone, skipping a stale lower milestone', () => {
		const result = getPendingAffiliatePopup({
			unlocked: false,
			hasBankDetails: false,
			spendProgressPercent: 96,
			popupsEnabled: true,
			seenAt: { ...NO_POPUPS_SEEN, progress50: SEEN }
		});

		expect(result).toBe('progress_95');
	});

	it('falls back to a lower milestone once the higher one has been seen', () => {
		const result = getPendingAffiliatePopup({
			unlocked: false,
			hasBankDetails: false,
			spendProgressPercent: 85,
			popupsEnabled: true,
			seenAt: { ...NO_POPUPS_SEEN, progress80: SEEN }
		});

		expect(result).toBe('progress_50');
	});

	it('shows an unseen milestone once the KYC prompt has been seen and no bank details exist', () => {
		const result = getPendingAffiliatePopup({
			unlocked: true,
			hasBankDetails: false,
			spendProgressPercent: 100,
			popupsEnabled: true,
			seenAt: { ...NO_POPUPS_SEEN, unlocked: SEEN }
		});

		expect(result).toBe('progress_95');
	});

	it('returns null once everything relevant has been seen', () => {
		const result = getPendingAffiliatePopup({
			unlocked: true,
			hasBankDetails: true,
			spendProgressPercent: 100,
			popupsEnabled: true,
			seenAt: {
				welcome: SEEN,
				progress50: SEEN,
				progress80: SEEN,
				progress95: SEEN,
				unlocked: SEEN,
				shareCode: SEEN
			}
		});

		expect(result).toBeNull();
	});
});
