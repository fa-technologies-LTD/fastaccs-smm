import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	findUser: vi.fn(),
	enable: vi.fn(),
	audit: vi.fn(),
	transaction: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	user: { findUnique: vi.fn(), update: vi.fn() },
	affiliateProgram: { findUnique: vi.fn(), updateMany: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { findUnique: mocks.findUser },
		$transaction: mocks.transaction
	}
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/affiliate', () => ({ enableAffiliateMode: mocks.enable }));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: mocks.audit }));

import { PATCH } from './+server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';

function callToggle(
	body: { isAffiliateEnabled: boolean; affiliateType?: 'regular' | 'super' },
	permitted = true
) {
	mocks.hasPermission.mockReturnValue(permitted);
	return PATCH({
		locals: { user: { id: ADMIN_ID }, adminContext: {} },
		params: { userId: USER_ID },
		request: new Request('https://smm.fastaccs.com/api/admin/affiliates/toggle', {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.findUser
		.mockResolvedValueOnce({ id: USER_ID })
		.mockResolvedValue({
			id: USER_ID,
			email: 'affiliate@example.com',
			fullName: 'Affiliate User',
			isAffiliateEnabled: true,
			affiliatePrograms: [{ status: 'active', isSuperAffiliate: false }]
		});
	mocks.enable.mockResolvedValue({ success: true, affiliateCode: 'AFF1' });
	mocks.audit.mockResolvedValue(undefined);
	tx.$queryRaw.mockResolvedValue([]);
	tx.user.findUnique.mockResolvedValue({ id: USER_ID, isAffiliateEnabled: true });
	tx.user.update.mockResolvedValue({});
	tx.affiliateProgram.findUnique.mockResolvedValue({
		id: 'program-1',
		status: 'active',
		isSuperAffiliate: false
	});
	tx.affiliateProgram.updateMany.mockResolvedValue({ count: 1 });
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('admin affiliate access and type controls', () => {
	it('requires affiliate-management permission', async () => {
		const response = await callToggle({ isAffiliateEnabled: true }, false);
		expect(response.status).toBe(401);
		expect(mocks.enable).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('passes the selected affiliate type and admin identity into the atomic service', async () => {
		mocks.findUser.mockReset();
		mocks.findUser
			.mockResolvedValueOnce({ id: USER_ID })
			.mockResolvedValue({
				id: USER_ID,
				email: 'affiliate@example.com',
				fullName: 'Affiliate User',
				isAffiliateEnabled: true,
				affiliatePrograms: [{ status: 'active', isSuperAffiliate: true }]
			});

		const response = await callToggle({ isAffiliateEnabled: true, affiliateType: 'super' });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.user.affiliateType).toBe('super');
		expect(mocks.enable).toHaveBeenCalledWith(USER_ID, {
			force: true,
			affiliateType: 'super',
			adminActorUserId: ADMIN_ID
		});
	});

	it('disables from the live row-locked state and writes the required audit in that transaction', async () => {
		mocks.findUser.mockReset();
		mocks.findUser
			.mockResolvedValueOnce({ id: USER_ID })
			.mockResolvedValue({
				id: USER_ID,
				email: 'affiliate@example.com',
				fullName: 'Affiliate User',
				isAffiliateEnabled: false,
				affiliatePrograms: [{ status: 'inactive', isSuperAffiliate: false }]
			});

		const response = await callToggle({ isAffiliateEnabled: false });

		expect(response.status).toBe(200);
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.affiliateProgram.updateMany).toHaveBeenCalledWith({
			where: { userId: USER_ID },
			data: { status: 'inactive' }
		});
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				actorUserId: ADMIN_ID,
				targetUserId: USER_ID,
				action: 'affiliate_access_disabled',
				required: true
			}),
			tx
		);
	});

	it('does not emit another audit for an already-disabled no-op', async () => {
		tx.user.findUnique.mockResolvedValue({ id: USER_ID, isAffiliateEnabled: false });
		tx.affiliateProgram.findUnique.mockResolvedValue({
			id: 'program-1',
			status: 'inactive',
			isSuperAffiliate: false
		});
		mocks.findUser.mockReset();
		mocks.findUser
			.mockResolvedValueOnce({ id: USER_ID })
			.mockResolvedValue({
				id: USER_ID,
				email: 'affiliate@example.com',
				fullName: 'Affiliate User',
				isAffiliateEnabled: false,
				affiliatePrograms: [{ status: 'inactive', isSuperAffiliate: false }]
			});

		const response = await callToggle({ isAffiliateEnabled: false });

		expect(response.status).toBe(200);
		expect(tx.user.update).not.toHaveBeenCalled();
		expect(tx.affiliateProgram.updateMany).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});
});
