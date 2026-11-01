import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	botSend: vi.fn(async () => 1),
	sendEmail: vi.fn<(params: Record<string, unknown>) => Promise<{ success: boolean }>>(
		async () => ({ success: true })
	),
	getAdminEmails: vi.fn(() => ['owner@example.com'])
}));

vi.mock('$lib/prisma', () => ({ prisma: {} }));
vi.mock('$lib/server/autopilot/bot', () => ({ botConfigured: () => true, botSend: mocks.botSend }));
vi.mock('$lib/services/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('$lib/auth/admin', () => ({ getAdminEmails: mocks.getAdminEmails }));
vi.mock('./boosting-health-report', () => ({
	buildBoostingHealthReport: vi.fn(async () => ({
		orders: { newOrders: 2, delivered: 1 },
		failures: [{ orders: 1 }],
		complaints: { open: 1 },
		stuck: []
	})),
	formatBoostingHealthReport: vi.fn(() => 'REPORT')
}));

const { sendBoostingHealthReport } = await import('./boosting-health-report-send');

describe('sending the Boosting check', () => {
	beforeEach(() => vi.clearAllMocks());

	it('is emailed to the admins and never sent to Telegram, even with the bot connected', async () => {
		const result = await sendBoostingHealthReport();
		expect(mocks.botSend).not.toHaveBeenCalled();
		expect(result).toMatchObject({ sentTo: 'email', failures: 1, openComplaints: 1 });
		expect(mocks.sendEmail).toHaveBeenCalledOnce();
		expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
			to: 'owner@example.com',
			body: 'REPORT',
			classification: 'operational'
		});
	});
});
