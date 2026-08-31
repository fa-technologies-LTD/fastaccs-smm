import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	decrypt: vi.fn(),
	mask: vi.fn(),
	audit: vi.fn(),
	transaction: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	affiliatePayoutDetails: { findUnique: vi.fn(), update: vi.fn() },
	notification: { create: vi.fn() }
}));

const submission = {
	id: 'bank-1',
	userId: '11111111-1111-4111-8111-111111111111',
	status: 'pending',
	rejectionReason: null,
	reviewedAt: null,
	reviewedBy: null,
	createdAt: new Date('2026-08-25T00:00:00.000Z'),
	updatedAt: new Date('2026-08-25T00:00:00.000Z')
};

vi.mock('$lib/prisma', () => ({
	prisma: {
		affiliatePayoutDetails: { findUnique: vi.fn() },
		$transaction: mocks.transaction
	}
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: mocks.audit }));
vi.mock('$lib/services/affiliate-payout-details', () => ({
	decryptAffiliateBankDetails: mocks.decrypt,
	maskAffiliateAccountNumber: mocks.mask
}));

import { prisma } from '$lib/prisma';
import { GET, POST } from './+server';

const AFFILIATE_ID = submission.userId;
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

function requestLocals(permitted = true) {
	mocks.hasPermission.mockReturnValue(permitted);
	return { user: { id: ADMIN_ID }, adminContext: {} };
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	vi.mocked(prisma.affiliatePayoutDetails.findUnique).mockResolvedValue(submission as never);
	mocks.decrypt.mockReturnValue({
		bankName: 'Test Bank',
		accountNumber: '0123456789',
		accountName: 'Ada Affiliate',
		phone: '08000000000',
		feedback: null
	});
	mocks.mask.mockReturnValue('••••••6789');
	mocks.audit.mockResolvedValue(undefined);
	tx.$queryRaw.mockResolvedValue([]);
	tx.affiliatePayoutDetails.findUnique.mockResolvedValue(submission);
	tx.affiliatePayoutDetails.update.mockResolvedValue({
		...submission,
		status: 'approved',
		updatedAt: new Date('2026-08-25T01:00:00.000Z')
	});
	tx.notification.create.mockResolvedValue({ id: 'notice-1' });
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('affiliate bank-details admin safeguards', () => {
	it('requires affiliate-management permission before reveal', async () => {
		const response = await GET({
			locals: requestLocals(false),
			params: { id: AFFILIATE_ID }
		} as never);

		expect(response.status).toBe(401);
		expect(mocks.decrypt).not.toHaveBeenCalled();
	});

	it('reveals only after writing the required access audit', async () => {
		const response = await GET({
			locals: requestLocals(),
			params: { id: AFFILIATE_ID }
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body.submission.accountNumber).toBe('0123456789');
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'affiliate_bank_details_viewed',
				required: true,
				metadata: { accountNumber: '••••••6789' }
			})
		);
	});

	it('fails closed when the reveal cannot be audited', async () => {
		mocks.audit.mockRejectedValue(new Error('audit unavailable'));

		const response = await GET({
			locals: requestLocals(),
			params: { id: AFFILIATE_ID }
		} as never);

		expect(response.status).toBe(503);
	});

	it('serializes approval, user notification, and audit', async () => {
		const response = await POST({
			locals: requestLocals(),
			params: { id: AFFILIATE_ID },
			request: new Request('https://smm.fastaccs.com/api/admin/affiliates/bank-details', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'approve' })
			})
		} as never);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, submission: { status: 'approved' } });
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.notification.create).toHaveBeenCalledOnce();
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'affiliate_bank_details_approved', required: true }),
			tx
		);
	});

	it('rejects an invalid repeated transition without notifying twice', async () => {
		tx.affiliatePayoutDetails.findUnique.mockResolvedValue({ ...submission, status: 'approved' });

		const response = await POST({
			locals: requestLocals(),
			params: { id: AFFILIATE_ID },
			request: new Request('https://smm.fastaccs.com/api/admin/affiliates/bank-details', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ action: 'reject', reason: 'Mismatch' })
			})
		} as never);

		expect(response.status).toBe(409);
		expect(tx.affiliatePayoutDetails.update).not.toHaveBeenCalled();
		expect(tx.notification.create).not.toHaveBeenCalled();
	});
});
