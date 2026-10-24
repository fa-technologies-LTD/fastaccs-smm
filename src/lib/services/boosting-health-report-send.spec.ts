import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	botConfigured: vi.fn(() => true),
	botSend: vi.fn(async () => 1),
	getAutopilotSettings: vi.fn(async () => ({ ownerChatId: '555' })),
	sendEmail: vi.fn<(params: Record<string, unknown>) => Promise<{ success: boolean }>>(
		async () => ({ success: true })
	),
	getAdminEmails: vi.fn(() => ['owner@example.com'])
}));

vi.mock('$lib/prisma', () => ({ prisma: {} }));
vi.mock('$lib/server/autopilot/bot', () => ({
	botConfigured: mocks.botConfigured,
	botSend: mocks.botSend
}));
vi.mock('$lib/server/autopilot/state', () => ({
	getAutopilotSettings: mocks.getAutopilotSettings
}));
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

	it('goes to the owner on Telegram', async () => {
		const result = await sendBoostingHealthReport();
		expect(mocks.botSend).toHaveBeenCalledWith('555', 'REPORT');
		expect(mocks.sendEmail).not.toHaveBeenCalled();
		expect(result).toMatchObject({ sentTo: 'telegram', failures: 1, openComplaints: 1 });
	});

	it('falls back to email when the bot is not connected or Telegram fails', async () => {
		mocks.getAutopilotSettings.mockResolvedValueOnce({ ownerChatId: null } as never);
		expect(await sendBoostingHealthReport()).toMatchObject({ sentTo: 'email' });
		mocks.botSend.mockRejectedValueOnce(new Error('down'));
		expect(await sendBoostingHealthReport()).toMatchObject({ sentTo: 'email' });
		expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
		expect(mocks.sendEmail.mock.calls[0][0]).toMatchObject({
			to: 'owner@example.com',
			body: 'REPORT',
			classification: 'operational'
		});
	});
});
