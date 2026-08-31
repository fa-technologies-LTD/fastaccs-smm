import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findActiveAffiliate: vi.fn(),
	findSubmission: vi.fn(),
	upsertSubmission: vi.fn(),
	encrypt: vi.fn(),
	decrypt: vi.fn()
}));

vi.mock('$lib/prisma', () => ({
	prisma: {
		user: { findFirst: mocks.findActiveAffiliate },
		affiliatePayoutDetails: {
			findUnique: mocks.findSubmission,
			upsert: mocks.upsertSubmission
		}
	}
}));
vi.mock('$lib/services/affiliate-payout-details', async () => {
	const actual = await vi.importActual<typeof import('$lib/services/affiliate-payout-details')>(
		'$lib/services/affiliate-payout-details'
	);
	return {
		...actual,
		encryptAffiliateBankDetails: mocks.encrypt,
		decryptAffiliateBankDetails: mocks.decrypt
	};
});

import { AffiliatePayoutEncryptionError } from '$lib/services/affiliate-payout-details';
import { GET, POST } from './+server';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const DETAILS = {
	bankName: 'Test Bank',
	accountNumber: '0123456789',
	accountName: 'Ada Affiliate',
	phone: '08000000000',
	feedback: null
};

function callPost(body: Record<string, unknown>, authenticated = true) {
	return POST({
		locals: { user: authenticated ? { id: USER_ID } : null },
		request: new Request('https://smm.fastaccs.com/api/affiliate/bank-details', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as never);
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.findActiveAffiliate.mockResolvedValue({ id: USER_ID });
	mocks.findSubmission.mockResolvedValue(null);
	mocks.encrypt.mockReturnValue({
		encryptedPayload: 'ciphertext',
		encryptionKeyId: 'current',
		accountNumberLast4: '6789'
	});
	mocks.decrypt.mockReturnValue(DETAILS);
	mocks.upsertSubmission.mockResolvedValue({ id: 'bank-1', status: 'pending' });
});

describe('affiliate bank-details submission', () => {
	it('requires an active affiliate program', async () => {
		mocks.findActiveAffiliate.mockResolvedValue(null);
		const response = await callPost(DETAILS);

		expect(response.status).toBe(403);
		expect(mocks.encrypt).not.toHaveBeenCalled();
	});

	it('rejects a malformed Nigerian account number', async () => {
		const response = await callPost({ ...DETAILS, accountNumber: '1234-567' });

		expect(response.status).toBe(400);
		expect(mocks.encrypt).not.toHaveBeenCalled();
	});

	it('stores only the encrypted envelope and clears legacy plaintext columns', async () => {
		const response = await callPost({ ...DETAILS, accountNumber: '01234 56789' });
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({ success: true, data: { status: 'pending' } });
		expect(mocks.encrypt).toHaveBeenCalledWith(USER_ID, DETAILS);
		expect(mocks.upsertSubmission).toHaveBeenCalledWith(
			expect.objectContaining({
				update: expect.objectContaining({
					bankName: null,
					accountNumber: null,
					encryptedPayload: 'ciphertext'
				})
			})
		);
	});

	it('fails closed without overwriting when encryption is unavailable', async () => {
		mocks.encrypt.mockImplementation(() => {
			throw new AffiliatePayoutEncryptionError('key unavailable');
		});

		const response = await callPost(DETAILS);

		expect(response.status).toBe(503);
		expect(mocks.upsertSubmission).not.toHaveBeenCalled();
	});

	it('returns a safe error instead of ciphertext or partial data when decryption fails', async () => {
		mocks.findSubmission.mockResolvedValue({ id: 'bank-1', userId: USER_ID });
		mocks.decrypt.mockImplementation(() => {
			throw new AffiliatePayoutEncryptionError('corrupt');
		});

		const response = await GET({ locals: { user: { id: USER_ID } } } as never);
		const body = await response.json();

		expect(response.status).toBe(503);
		expect(body).toEqual({ success: false, error: 'Bank details are temporarily unavailable.' });
	});
});
