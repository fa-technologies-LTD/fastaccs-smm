import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUser: vi.fn(),
	findProgram: vi.fn(),
	transaction: vi.fn(),
	recordEvent: vi.fn(),
	createAudit: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	user: { findUnique: vi.fn(), update: vi.fn() },
	affiliateProgram: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
	order: { count: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { findUnique: mocks.findUser },
		affiliateProgram: { findUnique: mocks.findProgram },
		$transaction: mocks.transaction
	}
}));

vi.mock('$lib/services/affiliate-events', () => ({
	recordAffiliateEvent: mocks.recordEvent
}));

vi.mock('$lib/services/admin-audit', () => ({
	createAdminAuditLog: mocks.createAudit
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

import { enableAffiliateMode } from './affiliate';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findUser.mockImplementation(({ select }: { select?: Record<string, boolean> }) =>
		select?.fullName ? Promise.resolve({ fullName: 'Ada Lovelace' }) : Promise.resolve({ id: USER_ID })
	);
	mocks.findProgram.mockResolvedValue(null);
	mocks.recordEvent.mockResolvedValue({});
	mocks.createAudit.mockResolvedValue({});
	tx.$queryRaw.mockResolvedValue([]);
	tx.user.findUnique.mockResolvedValue({
		id: USER_ID,
		isActive: true,
		isAffiliateEnabled: false,
		userType: 'CUSTOMER'
	});
	tx.user.update.mockResolvedValue({});
	tx.affiliateProgram.findUnique.mockResolvedValue(null);
	tx.affiliateProgram.create.mockResolvedValue({ id: 'program-1', affiliateCode: 'ADLVL' });
	tx.affiliateProgram.update.mockResolvedValue({});
	tx.order.count.mockResolvedValue(1);
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('affiliate activation integrity', () => {
	it('does not let automatic activation undo an explicit admin disable', async () => {
		tx.user.findUnique.mockResolvedValue({
			id: USER_ID,
			isActive: true,
			isAffiliateEnabled: false,
			userType: 'AFFILIATE'
		});
		tx.affiliateProgram.findUnique.mockResolvedValue({
			id: 'program-1',
			affiliateCode: 'ADLVL',
			status: 'inactive',
			isSuperAffiliate: false
		});

		const result = await enableAffiliateMode(USER_ID);

		expect(result).toEqual({
			success: false,
			error: 'Affiliate access is currently disabled. Contact support for review.'
		});
		expect(tx.order.count).not.toHaveBeenCalled();
		expect(tx.user.update).not.toHaveBeenCalled();
		expect(tx.affiliateProgram.update).not.toHaveBeenCalled();
		expect(mocks.recordEvent).not.toHaveBeenCalled();
	});

	it('rechecks the retained-purchase requirement while holding the user lock', async () => {
		tx.order.count.mockResolvedValue(0);

		const result = await enableAffiliateMode(USER_ID);

		expect(result.success).toBe(false);
		expect(result.error).toContain('first successfully completed purchase');
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.affiliateProgram.create).not.toHaveBeenCalled();
	});

	it('creates one regular program and records the activation event after the locked commit', async () => {
		const result = await enableAffiliateMode(USER_ID);

		expect(result).toEqual({ success: true, affiliateCode: 'ADLVL' });
		expect(tx.affiliateProgram.create).toHaveBeenCalledWith({
			data: {
				userId: USER_ID,
				affiliateCode: 'ADLVL',
				status: 'active',
				isSuperAffiliate: false
			},
			select: { id: true, affiliateCode: true }
		});
		expect(tx.user.update).toHaveBeenCalledWith({
			where: { id: USER_ID },
			data: { isAffiliateEnabled: true, userType: 'AFFILIATE' }
		});
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'affiliate_program_enabled',
				affiliateUserId: USER_ID,
				source: 'first_retained_purchase'
			})
		);
	});

	it('applies a regular-to-super admin change and its required audit in one transaction', async () => {
		tx.user.findUnique.mockResolvedValue({
			id: USER_ID,
			isActive: true,
			isAffiliateEnabled: true,
			userType: 'AFFILIATE'
		});
		tx.affiliateProgram.findUnique.mockResolvedValue({
			id: 'program-1',
			affiliateCode: 'ADLVL',
			status: 'active',
			isSuperAffiliate: false
		});

		const result = await enableAffiliateMode(USER_ID, {
			force: true,
			affiliateType: 'super',
			adminActorUserId: ADMIN_ID
		});

		expect(result).toEqual({ success: true, affiliateCode: 'ADLVL' });
		expect(tx.affiliateProgram.update).toHaveBeenCalledWith({
			where: { id: 'program-1' },
			data: { status: 'active', isSuperAffiliate: true }
		});
		expect(mocks.createAudit).toHaveBeenCalledWith(
			expect.objectContaining({
				actorUserId: ADMIN_ID,
				targetUserId: USER_ID,
				action: 'affiliate_type_changed',
				required: true
			}),
			tx
		);
	});
});
