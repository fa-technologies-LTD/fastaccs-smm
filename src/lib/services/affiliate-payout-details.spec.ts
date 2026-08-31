import { afterEach, describe, expect, it } from 'vitest';
import {
	AffiliatePayoutEncryptionError,
	decryptAffiliateBankDetails,
	encryptAffiliateBankDetails,
	maskAffiliateAccountNumber
} from './affiliate-payout-details';

const ORIGINAL_KEYS = process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS;
const USER_ID = '11111111-1111-1111-1111-111111111111';
const DETAILS = {
	bankName: 'Test Bank',
	accountNumber: '0123456789',
	accountName: 'Ada Affiliate',
	phone: '08000000000',
	feedback: null
};

function key(byte: number): string {
	return Buffer.alloc(32, byte).toString('base64');
}

afterEach(() => {
	if (ORIGINAL_KEYS === undefined) delete process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS;
	else process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = ORIGINAL_KEYS;
});

describe('affiliate payout bank-detail protection', () => {
	it('encrypts the payload, stores only last four, and decrypts with the matching key', () => {
		process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `current:${key(1)}`;
		const encrypted = encryptAffiliateBankDetails(USER_ID, DETAILS);

		expect(encrypted.encryptedPayload).not.toContain(DETAILS.accountNumber);
		expect(encrypted.encryptionKeyId).toBe('current');
		expect(encrypted.accountNumberLast4).toBe('6789');
		expect(
			decryptAffiliateBankDetails({
				userId: USER_ID,
				bankName: null,
				accountNumber: null,
				accountName: null,
				phone: null,
				feedback: null,
				...encrypted
			})
		).toEqual(DETAILS);
	});

	it('supports rotation by decrypting older rows while using the first key for new rows', () => {
		process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `old:${key(2)}`;
		const oldEnvelope = encryptAffiliateBankDetails(USER_ID, DETAILS);
		process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `new:${key(3)},old:${key(2)}`;

		const freshEnvelope = encryptAffiliateBankDetails(USER_ID, DETAILS);
		expect(freshEnvelope.encryptionKeyId).toBe('new');
		expect(
			decryptAffiliateBankDetails({
				userId: USER_ID,
				bankName: null,
				accountNumber: null,
				accountName: null,
				phone: null,
				feedback: null,
				...oldEnvelope
			})
		).toEqual(DETAILS);
	});

	it('fails closed when the key is absent or the ciphertext is corrupted', () => {
		delete process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS;
		expect(() => encryptAffiliateBankDetails(USER_ID, DETAILS)).toThrow(
			AffiliatePayoutEncryptionError
		);

		process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `current:${key(4)}`;
		const encrypted = encryptAffiliateBankDetails(USER_ID, DETAILS);
		const envelope = JSON.parse(
			Buffer.from(encrypted.encryptedPayload, 'base64').toString('utf8')
		) as { data: string };
		envelope.data = `${envelope.data.slice(0, -2)}AA`;
		expect(() =>
			decryptAffiliateBankDetails({
				userId: USER_ID,
				bankName: null,
				accountNumber: null,
				accountName: null,
				phone: null,
				feedback: null,
				...encrypted,
				encryptedPayload: Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64')
			})
		).toThrow(AffiliatePayoutEncryptionError);
	});

	it('masks account numbers in audit-facing output', () => {
		expect(maskAffiliateAccountNumber('0123456789')).toBe('••••••6789');
	});
});
