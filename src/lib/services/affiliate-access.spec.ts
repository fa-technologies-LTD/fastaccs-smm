import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUser: vi.fn(),
	findProgram: vi.fn(),
	countOrders: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { findUnique: mocks.findUser },
		affiliateProgram: { findFirst: mocks.findProgram },
		order: { count: mocks.countOrders }
	}
}));
vi.mock('$lib/services/email', () => ({ sendEmail: vi.fn(), sendMarketingEmail: vi.fn() }));
vi.mock('$lib/services/affiliate-notification-email', () => ({
	sendAffiliateUnlockEmailIfNeeded: vi.fn(),
	sendFirstStoreCreditEmailIfNeeded: vi.fn()
}));
vi.mock('$lib/services/affiliate-payout-email', () => ({
	sendAffiliatePayoutStatusEmailIfNeeded: vi.fn()
}));
vi.mock('$lib/services/admin-settings', () => ({ getOperationalAlertRecipients: vi.fn() }));
vi.mock('$lib/services/affiliate-events', () => ({ recordAffiliateEvent: vi.fn() }));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: vi.fn() }));

import { getAffiliateAccessSummary } from './affiliate';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findUser.mockResolvedValue({ isActive: true, isAffiliateEnabled: false });
	mocks.findProgram.mockResolvedValue(null);
	mocks.countOrders.mockResolvedValue(1);
});

describe('affiliate access summary', () => {
	it('unlocks activation after the first retained order without loading the full affiliate report', async () => {
		await expect(getAffiliateAccessSummary('user-1')).resolves.toEqual({
			eligible: true,
			unlocked: true,
			canActivate: true,
			isActive: false
		});
		expect(mocks.countOrders).toHaveBeenCalledOnce();
	});

	it('recognises an active affiliate', async () => {
		mocks.findUser.mockResolvedValue({ isActive: true, isAffiliateEnabled: true });
		mocks.findProgram.mockResolvedValue({ status: 'active' });

		await expect(getAffiliateAccessSummary('user-1')).resolves.toEqual({
			eligible: true,
			unlocked: true,
			canActivate: false,
			isActive: true
		});
	});

	it('does not advertise access that an administrator explicitly disabled', async () => {
		mocks.findProgram.mockResolvedValue({ status: 'inactive' });

		await expect(getAffiliateAccessSummary('user-1')).resolves.toEqual({
			eligible: false,
			unlocked: false,
			canActivate: false,
			isActive: false
		});
	});
});
