import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findFirst: vi.fn(),
	findMany: vi.fn(),
	sendEmail: vi.fn(),
	push: vi.fn()
}));
vi.mock('$lib/prisma', () => ({
	prisma: { emailNotification: { findFirst: mocks.findFirst, findMany: mocks.findMany } }
}));
vi.mock('$lib/services/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('$lib/services/push-notifications', () => ({ sendPushToUsers: mocks.push }));
vi.mock('$lib/auth/admin-roles', () => ({ getAdminUserIds: async () => ['owner'] }));
vi.mock('$lib/services/admin-settings', () => ({
	getOperationalAlertRecipients: async () => ['ops@example.com'],
	getBusinessTimezoneSetting: vi.fn(),
	getLowStockPolicyState: vi.fn(),
	setLowStockPolicyState: vi.fn(),
	setLowStockAlertState: vi.fn()
}));

import { retryFailedCriticalAlerts, sendCriticalAdminAlert } from './admin-alerts';

const alert = (dedupeKey: string) => ({
	title: 'Late payment held for review',
	message: 'ORD-1 received a verified payment after the order had already closed.',
	source: 'payments.webhook',
	dedupeKey
});

beforeEach(() => {
	vi.clearAllMocks();
	mocks.push.mockResolvedValue(undefined);
	mocks.findFirst.mockResolvedValue(null);
});

describe('money alerts are never silent', () => {
	it('still pushes to phones when the email fails the first time', async () => {
		mocks.sendEmail.mockResolvedValue({ success: false });
		expect(await sendCriticalAdminAlert(alert('first-failure'))).toEqual({
			sent: false,
			reason: 'send_failed'
		});
		expect(mocks.push).toHaveBeenCalledOnce();
	});

	it('does not push again for a repeat of an alert that already failed', async () => {
		mocks.sendEmail.mockResolvedValue({ success: false });
		// No 'sent' row in the cooldown window, but an earlier failed try exists.
		mocks.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'earlier-try' });
		await sendCriticalAdminAlert(alert('repeat-failure'));
		expect(mocks.push).not.toHaveBeenCalled();
	});

	it('pushes alongside an email that went out', async () => {
		mocks.sendEmail.mockResolvedValue({ success: true });
		expect(await sendCriticalAdminAlert(alert('delivered'))).toEqual({ sent: true });
		expect(mocks.push).toHaveBeenCalledOnce();
	});

	it('re-emails failed alerts until they arrive, at most five tries, and leaves the rest alone', async () => {
		const row = (referenceId: string, status: string, email = 'ops@example.com') => ({
			referenceId,
			email,
			status,
			subject: `Alert ${referenceId}`,
			body: 'Details'
		});
		mocks.findMany.mockResolvedValue([
			row('critical:held-payment', 'failed'),
			row('critical:recovered', 'failed'),
			row('critical:recovered', 'sent'),
			row('critical:given-up', 'failed'),
			row('critical:given-up', 'failed'),
			row('critical:given-up', 'failed'),
			row('critical:given-up', 'failed'),
			row('critical:given-up', 'failed'),
			row('critical:held-payment', 'sent', 'owner@example.com')
		]);
		mocks.sendEmail.mockResolvedValue({ success: true });
		expect(await retryFailedCriticalAlerts(new Date('2026-11-02T12:00:00Z'))).toEqual({
			retried: 1,
			sent: 1
		});
		expect(mocks.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					referenceId: { startsWith: 'critical:' },
					createdAt: { gte: new Date('2026-11-01T12:00:00Z') }
				})
			})
		);
		expect(mocks.sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: 'ops@example.com',
				subject: 'Alert critical:held-payment',
				body: 'Details',
				referenceId: 'critical:held-payment'
			})
		);
	});
});
