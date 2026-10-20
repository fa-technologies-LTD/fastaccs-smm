import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	users: [] as unknown[],
	sent: [] as unknown[],
	send: vi.fn(),
	offer: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { findMany: async () => mocks.users },
		emailNotification: { findMany: async () => mocks.sent }
	}
}));
vi.mock('$lib/helpers/site-url', () => ({ getSiteBaseUrl: () => 'https://smm.fastaccs.com' }));
vi.mock('$lib/services/email', () => ({ sendEmail: mocks.send }));
vi.mock('$lib/services/promotions', () => ({ getFirstOrderOffer: mocks.offer }));

import {
	isLikelyRealMailbox,
	runVerificationReminders,
	verificationReminderContent
} from './verification-reminders';

const NOW = new Date('2026-11-05T16:00:00.000Z');

beforeEach(() => {
	vi.clearAllMocks();
	mocks.users = [];
	mocks.sent = [];
	mocks.send.mockResolvedValue({ success: true });
	mocks.offer.mockResolvedValue({ label: '10% off your first account order' });
});

describe('confirm-your-email reminders', () => {
	it('only writes to mainstream providers, never throwaway domains', () => {
		expect(isLikelyRealMailbox('ada@gmail.com')).toBe(true);
		expect(isLikelyRealMailbox('ada@company.com.ng')).toBe(true);
		expect(isLikelyRealMailbox('bot@a7gi.ru')).toBe(false);
		expect(isLikelyRealMailbox(null)).toBe(false);
	});

	it('explains checkout is locked, links to the verify page and mentions the first-order offer', async () => {
		mocks.users = [{ id: 'u1', email: 'ada@gmail.com', fullName: 'Ada Obi' }];
		const result = await runVerificationReminders({ now: NOW });
		expect(result).toMatchObject({ eligible: 1, sent: 1, byStep: { 1: 1, 2: 0 } });
		expect(mocks.send.mock.calls[0][0]).toMatchObject({
			subject: 'Confirm your email to start shopping',
			ctaUrl: 'https://smm.fastaccs.com/verify-email',
			notificationType: 'verification_reminder'
		});
		expect(mocks.send.mock.calls[0][0].body).toContain('checkout is locked');
		expect(mocks.send.mock.calls[0][0].body).toContain('10% off your first account order');
	});

	it('sends the second a week after the first, and never a third', async () => {
		mocks.users = [
			{ id: 'u1', email: 'a@gmail.com', fullName: null },
			{ id: 'u2', email: 'b@gmail.com', fullName: null },
			{ id: 'u3', email: 'c@gmail.com', fullName: null }
		];
		mocks.sent = [
			{ userId: 'u1', sentAt: new Date('2026-10-28T16:00:00.000Z') }, // 8 days ago: due
			{ userId: 'u2', sentAt: new Date('2026-11-02T16:00:00.000Z') }, // 3 days ago: wait
			{ userId: 'u3', sentAt: new Date('2026-10-01T16:00:00.000Z') },
			{ userId: 'u3', sentAt: new Date('2026-10-09T16:00:00.000Z') } // already had both
		];
		const result = await runVerificationReminders({ now: NOW });
		expect(result).toMatchObject({ eligible: 1, sent: 1, byStep: { 1: 0, 2: 1 } });
		expect(mocks.send.mock.calls[0][0].subject).toBe('Last reminder: confirm your email');
	});

	it('counts without sending on a dry run', async () => {
		mocks.users = [{ id: 'u1', email: 'a@gmail.com', fullName: null }];
		expect(await runVerificationReminders({ now: NOW, dryRun: true })).toMatchObject({
			eligible: 1,
			sent: 0,
			byStep: { 1: 1, 2: 0 }
		});
		expect(mocks.send).not.toHaveBeenCalled();
		expect(verificationReminderContent(2, 'Ada', null).body).not.toContain('first account order');
	});
});
