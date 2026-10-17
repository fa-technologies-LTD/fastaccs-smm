import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ find: vi.fn(), alert: vi.fn(), settings: vi.fn() }));
vi.mock('$lib/prisma', () => ({ prisma: { order: { findUnique: mocks.find } } }));
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: mocks.alert }));
vi.mock('./admin-settings', () => ({ getAdminSettingsSnapshot: mocks.settings }));
import { notifyBoostingOrderPaid, notifyManualHandoverOrderPaid } from './manual-handover';
import { sendWeeklyBusinessDigest } from './weekly-business-digest';
import { shouldEmailAdmin } from '$lib/helpers/admin-email-policy';
beforeEach(() => {
	vi.clearAllMocks();
});
it('silences routine orders and routine summaries without suppressing actionable work', async () => {
	await notifyBoostingOrderPaid('order', 'test');
	expect(mocks.find).not.toHaveBeenCalled();
	expect(mocks.alert).not.toHaveBeenCalled();
	expect(await sendWeeklyBusinessDigest()).toMatchObject({
		sent: false,
		reason: 'routine_admin_email_disabled'
	});
	expect(shouldEmailAdmin('action_required')).toBe(true);
});
it('retains the once-per-order alert for manual delivery', async () => {
	mocks.find.mockResolvedValue({
		id: 'order',
		orderNumber: 'ORD-1',
		totalAmount: 1000,
		user: { fullName: 'Buyer', email: 'buyer@example.invalid' }
	});
	mocks.settings.mockResolvedValue({ business: { whatsappNumber: '' } });
	await notifyManualHandoverOrderPaid('order', 'test');
	expect(mocks.alert).toHaveBeenCalledWith(
		expect.objectContaining({
			title: 'Action needed: manual delivery',
			dedupeKey: 'manual-handover-paid:order'
		})
	);
});
