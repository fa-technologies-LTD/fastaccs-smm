import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorized: vi.fn(), run: vi.fn(), reminders: vi.fn() }));
vi.mock('$lib/server/cron-dispatcher', () => ({ isCronAuthorized: mocks.authorized }));
vi.mock('$lib/server/automation-runner', () => ({ runAutomationJob: mocks.run }));
vi.mock('$lib/services/store-credit-reminder', () => ({
	runStoreCreditReminders: mocks.reminders
}));
import { GET } from './+server';

describe('store-credit reminder cron boundary', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		mocks.authorized.mockReturnValue(true);
		mocks.run.mockImplementation(async (input) => ({ executed: true, result: await input.work() }));
		mocks.reminders.mockResolvedValue({ processed: 1, sent: 1, skipped: 0, failed: 0 });
	});
	it('rejects unauthorized requests without reading credit or sending mail', async () => {
		mocks.authorized.mockReturnValue(false);
		const response = await GET({
			request: new Request('https://smm.fastaccs.com/api/internal/cron/store-credit-reminders')
		} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(401);
		expect(mocks.run).not.toHaveBeenCalled();
		expect(mocks.reminders).not.toHaveBeenCalled();
	});
	it('runs through the monitored overlap lock and includes send/failure counts', async () => {
		const response = await GET({
			request: new Request('https://smm.fastaccs.com/api/internal/cron/store-credit-reminders')
		} as Parameters<typeof GET>[0]);
		expect(response.status).toBe(200);
		expect(mocks.run).toHaveBeenCalledWith(
			expect.objectContaining({ jobName: 'store-credit-reminders', work: expect.any(Function) })
		);
		expect(await response.json()).toMatchObject({
			success: true,
			data: { result: { sent: 1, failed: 0 } }
		});
	});
});
