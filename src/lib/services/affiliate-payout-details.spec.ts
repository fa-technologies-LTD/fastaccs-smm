import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	AffiliatePayoutEncryptionError,
	decryptAffiliateBankDetails,
	encryptAffiliateBankDetails,
	maskAffiliateAccountNumber
} from './affiliate-payout-details';

/**
 * The service resolves keys as `env.X || process.env.X`, where `env` is $env/dynamic/private —
 * a snapshot taken when that module loads. Setting process.env here therefore CANNOT reach it:
 * once a real key existed in .env, the service silently used that instead of the test's key and
 * these tests failed. Worse, they only passed on a machine with NO key configured, so the closer
 * a developer's setup was to production the less this suite actually verified.
 *
 * Mocking the module lets the tests drive the value the service really reads, and clearing BOTH
 * sources before every test makes them hermetic — the result no longer depends on the developer's
 * local environment either way.
 */
const { mockEnv } = vi.hoisted(() => ({ mockEnv: {} as Record<string, string | undefined> }));
vi.mock('$env/dynamic/private', () => ({ env: mockEnv }));

const ORIGINAL_PROCESS_KEYS = process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS;
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

function clearConfiguredKeys(): void {
	delete mockEnv.AFFILIATE_PAYOUT_ENCRYPTION_KEYS;
	delete process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS;
}

// Start every test with NO key from either source, so each one states the key it relies on.
beforeEach(clearConfiguredKeys);

afterEach(() => {
	clearConfiguredKeys();
	// Leave the developer's real environment exactly as we found it.
	if (ORIGINAL_PROCESS_KEYS !== undefined) {
		process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = ORIGINAL_PROCESS_KEYS;
	}
});

describe('affiliate payout bank-detail protection', () => {
	it('encrypts the payload, stores only last four, and decrypts with the matching key', () => {
		mockEnv.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `current:${key(1)}`;
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
		mockEnv.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `old:${key(2)}`;
		const oldEnvelope = encryptAffiliateBankDetails(USER_ID, DETAILS);
		mockEnv.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `new:${key(3)},old:${key(2)}`;

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
		// beforeEach cleared BOTH sources, so no key is configured at all here.
		expect(() => encryptAffiliateBankDetails(USER_ID, DETAILS)).toThrow(
			AffiliatePayoutEncryptionError
		);

		mockEnv.AFFILIATE_PAYOUT_ENCRYPTION_KEYS = `current:${key(4)}`;
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
