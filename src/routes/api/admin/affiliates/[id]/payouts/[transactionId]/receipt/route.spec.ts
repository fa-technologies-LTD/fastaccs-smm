import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	findFirst: vi.fn(),
	upload: vi.fn(),
	audit: vi.fn(),
	transaction: vi.fn()
}));
const tx = vi.hoisted(() => ({
	$queryRaw: vi.fn(),
	walletTransaction: { findUnique: vi.fn(), update: vi.fn() },
	notification: { create: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({
	prisma: { walletTransaction: { findFirst: mocks.findFirst }, $transaction: mocks.transaction }
}));
vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/services/admin-audit', () => ({ createAdminAuditLog: mocks.audit }));
vi.mock('$lib/server/payout-receipts', async (original) => ({
	...(await original<typeof import('$lib/server/payout-receipts')>()),
	uploadPayoutReceipt: mocks.upload
}));

import { POST } from './+server';

const AFFILIATE = '11111111-1111-4111-8111-111111111111';
const PAYOUT = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

function send(file: File) {
	const body = new FormData();
	body.append('file', file);
	return POST({
		params: { id: AFFILIATE, transactionId: PAYOUT },
		request: new Request('https://smm.fastaccs.com/x', { method: 'POST', body }),
		locals: { user: { id: ADMIN }, adminContext: {} }
	} as never);
}
const jpeg = () => new File([new Uint8Array([1, 2, 3])], 'r.jpg', { type: 'image/jpeg' });

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.findFirst.mockResolvedValue({ id: PAYOUT, status: 'paid', amount: 14_700 });
	mocks.upload.mockResolvedValue({
		publicId: 'payout-receipts/a',
		format: 'jpg',
		bytes: 3,
		uploadedAt: '2026-10-30T20:00:00.000Z',
		uploadedBy: ADMIN
	});
	tx.walletTransaction.findUnique.mockResolvedValue({
		metadata: { bankTransferReference: 'PAID' }
	});
	mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
		callback(tx)
	);
});

describe('adding a payout receipt', () => {
	it('stores the receipt on a paid payout, keeps its other details and tells the affiliate', async () => {
		const response = await send(jpeg());
		expect(response.status).toBe(200);
		expect(tx.$queryRaw).toHaveBeenCalledOnce();
		expect(tx.walletTransaction.update).toHaveBeenCalledWith({
			where: { id: PAYOUT },
			data: {
				metadata: {
					bankTransferReference: 'PAID',
					receipt: expect.objectContaining({ publicId: 'payout-receipts/a', format: 'jpg' })
				}
			}
		});
		expect(tx.notification.create).toHaveBeenCalledWith({
			data: expect.objectContaining({ userId: AFFILIATE, title: 'Payment receipt added' })
		});
		expect(mocks.audit).toHaveBeenCalledOnce();
	});

	it('refuses a payout that is not paid yet, and anything that is not an image', async () => {
		mocks.findFirst.mockResolvedValueOnce({ id: PAYOUT, status: 'requested', amount: 14_700 });
		expect((await send(jpeg())).status).toBe(409);
		expect((await send(new File(['x'], 'r.pdf', { type: 'application/pdf' }))).status).toBe(400);
		expect(mocks.upload).not.toHaveBeenCalled();
	});

	it('needs affiliate-management permission', async () => {
		mocks.hasPermission.mockReturnValue(false);
		expect((await send(jpeg())).status).toBe(401);
		expect(mocks.findFirst).not.toHaveBeenCalled();
	});
});
