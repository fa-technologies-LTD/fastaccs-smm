import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	maximumPayable: vi.fn(),
	recordEvent: vi.fn(),
	audit: vi.fn(),
	sendStatusEmail: vi.fn(),
	decryptBank: vi.fn(),
	transaction: vi.fn()
}));

const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	walletTransaction: { findFirst: vi.fn(), update: vi.fn() },
	affiliatePayoutDetails: { findFirst: vi.fn() }
}));

vi.mock('$lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/affiliate', () => ({
	getAffiliateMaximumPayable: mocks.maximumPayable
}));
vi.mock('$lib/services/affiliate-events', () => ({ recordAffiliateEvent: mocks.recordEvent }));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: mocks.audit }));
vi.mock('$lib/services/affiliate-payout-email', () => ({
	sendAffiliatePayoutStatusEmailIfNeeded: mocks.sendStatusEmail
}));
vi.mock('$lib/services/affiliate-payout-details', () => ({
	decryptAffiliateBankDetails: mocks.decryptBank
}));

import { POST } from './+server';

const AFFILIATE_ID = '11111111-1111-4111-8111-111111111111';
const TRANSACTION_ID = '22222222-2222-4222-8222-222222222222';

function callPayout(action: string, extra: Record<string, unknown> = {}, authenticated = true) {
	return POST({
		locals: authenticated
			? { user: { id: '33333333-3333-4333-8333-333333333333' }, adminContext: {} }
			: { user: null, adminContext: null },
		params: { id: AFFILIATE_ID },
		request: new Request('https://smm.fastaccs.com/api/admin/affiliates/payouts', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action, transactionId: TRANSACTION_ID, ...extra })
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.maximumPayable.mockResolvedValue(6_000);
	mocks.recordEvent.mockResolvedValue(true);
	mocks.audit.mockResolvedValue({});
	mocks.sendStatusEmail.mockResolvedValue(true);
	mocks.decryptBank.mockReturnValue({ accountNumber: '0123456789' });
	tx.$queryRaw.mockResolvedValue([]);
	tx.walletTransaction.findFirst.mockResolvedValue({
		id: TRANSACTION_ID,
		status: 'requested',
		amount: 6_000,
		metadata: {},
		updatedAt: new Date('2026-08-25T00:00:00.000Z')
	});
	tx.affiliatePayoutDetails.findFirst.mockResolvedValue({
		id: 'bank-1',
		accountNumberLast4: '6789'
	});
	tx.walletTransaction.update.mockResolvedValue({
		id: TRANSACTION_ID,
		status: 'paid',
		amount: 6_000,
		updatedAt: new Date('2026-08-25T01:00:00.000Z')
	});
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('affiliate payout finalisation safeguards', () => {
	it('requires the affiliate-management permission', async () => {
		mocks.hasPermission.mockReturnValue(false);
		const response = await callPayout('mark_paid', { payoutReference: 'BANK-1' });

		expect(response.status).toBe(401);
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('requires an external bank-transfer reference before marking money paid', async () => {
		const response = await callPayout('mark_paid');
		const body = await response.json();

		expect(response.status).toBe(400);
		expect(body.error).toContain('transfer reference');
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('refuses payment when bank details are no longer approved', async () => {
		tx.affiliatePayoutDetails.findFirst.mockResolvedValue(null);

		const response = await callPayout('mark_paid', { payoutReference: 'BANK-1' });

		expect(response.status).toBe(409);
		expect(tx.walletTransaction.update).not.toHaveBeenCalled();
	});

	it('refuses payment when the approved encrypted destination is unreadable', async () => {
		mocks.decryptBank.mockImplementation(() => {
			throw new Error('missing encryption key');
		});

		const response = await callPayout('mark_paid', { payoutReference: 'BANK-1' });
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toContain('cannot be verified securely');
		expect(tx.walletTransaction.update).not.toHaveBeenCalled();
	});

	it('refuses a stale request that now exceeds retained available earnings', async () => {
		mocks.maximumPayable.mockResolvedValue(4_500);

		const response = await callPayout('mark_paid', { payoutReference: 'BANK-1' });
		const body = await response.json();

		expect(response.status).toBe(409);
		expect(body.error).toContain('higher than');
		expect(tx.walletTransaction.update).not.toHaveBeenCalled();
	});

	it('serializes and audits a valid paid transition', async () => {
		const response = await callPayout('mark_paid', { payoutReference: 'BANK-1' });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, payout: { status: 'paid', amount: 6_000 } });
		expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
		expect(mocks.maximumPayable).toHaveBeenCalledWith(AFFILIATE_ID, tx);
		expect(tx.walletTransaction.update).toHaveBeenCalledOnce();
		expect(mocks.recordEvent).toHaveBeenCalledOnce();
		expect(mocks.audit).toHaveBeenCalledOnce();
		expect(mocks.audit).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'affiliate_payout_status_changed', required: true }),
			tx
		);
	});
});
