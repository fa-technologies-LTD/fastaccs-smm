import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { env } from '$env/dynamic/private';

export interface AffiliateBankDetails {
	bankName: string;
	accountNumber: string;
	accountName: string;
	phone: string;
	feedback: string | null;
}

export interface StoredAffiliateBankDetails {
	userId: string;
	bankName: string | null;
	accountNumber: string | null;
	accountName: string | null;
	phone: string | null;
	feedback: string | null;
	encryptedPayload: string | null;
	encryptionKeyId: string | null;
	accountNumberLast4: string | null;
}

interface EncryptionKey {
	id: string;
	key: Buffer;
}

interface EncryptedEnvelope {
	v: 1;
	iv: string;
	tag: string;
	data: string;
}

export class AffiliatePayoutEncryptionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AffiliatePayoutEncryptionError';
	}
}

function configuredKeys(): EncryptionKey[] {
	const source = String(
		env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS || process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS || ''
	).trim();
	if (!source) return [];

	return source
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const separator = entry.indexOf(':');
			if (separator <= 0) {
				throw new AffiliatePayoutEncryptionError(
					'AFFILIATE_PAYOUT_ENCRYPTION_KEYS must use key-id:base64-key entries.'
				);
			}
			const id = entry.slice(0, separator).trim();
			const key = Buffer.from(entry.slice(separator + 1).trim(), 'base64');
			if (!id || key.length !== 32) {
				throw new AffiliatePayoutEncryptionError(
					'Each affiliate payout encryption key must decode to exactly 32 bytes.'
				);
			}
			return { id, key };
		});
}

function aad(userId: string, keyId: string): Buffer {
	return Buffer.from(`fastaccs:affiliate-payout:${userId}:${keyId}`, 'utf8');
}

export function encryptAffiliateBankDetails(
	userId: string,
	details: AffiliateBankDetails
): {
	encryptedPayload: string;
	encryptionKeyId: string;
	accountNumberLast4: string;
} {
	const current = configuredKeys()[0];
	if (!current) {
		throw new AffiliatePayoutEncryptionError(
			'Affiliate payout encryption is not configured. Bank details were not stored.'
		);
	}

	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', current.key, iv);
	cipher.setAAD(aad(userId, current.id));
	const plaintext = Buffer.from(JSON.stringify(details), 'utf8');
	const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const envelope: EncryptedEnvelope = {
		v: 1,
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64'),
		data: encrypted.toString('base64')
	};

	return {
		encryptedPayload: Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64'),
		encryptionKeyId: current.id,
		accountNumberLast4: details.accountNumber.slice(-4)
	};
}

export function decryptAffiliateBankDetails(
	row: StoredAffiliateBankDetails
): AffiliateBankDetails {
	if (!row.encryptedPayload) {
		if (!row.bankName || !row.accountNumber || !row.accountName || !row.phone) {
			throw new AffiliatePayoutEncryptionError('Stored affiliate bank details are incomplete.');
		}
		return {
			bankName: row.bankName,
			accountNumber: row.accountNumber,
			accountName: row.accountName,
			phone: row.phone,
			feedback: row.feedback
		};
	}

	const keyId = String(row.encryptionKeyId || '').trim();
	const key = configuredKeys().find((candidate) => candidate.id === keyId);
	if (!key) {
		throw new AffiliatePayoutEncryptionError(
			`Affiliate payout encryption key ${keyId || '(missing)'} is unavailable.`
		);
	}

	try {
		const envelope = JSON.parse(
			Buffer.from(row.encryptedPayload, 'base64').toString('utf8')
		) as EncryptedEnvelope;
		if (envelope.v !== 1) throw new Error('unsupported envelope');
		const decipher = createDecipheriv('aes-256-gcm', key.key, Buffer.from(envelope.iv, 'base64'));
		decipher.setAAD(aad(row.userId, key.id));
		decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
		const plaintext = Buffer.concat([
			decipher.update(Buffer.from(envelope.data, 'base64')),
			decipher.final()
		]);
		return JSON.parse(plaintext.toString('utf8')) as AffiliateBankDetails;
	} catch {
		throw new AffiliatePayoutEncryptionError('Affiliate bank details could not be decrypted.');
	}
}

export function maskAffiliateAccountNumber(accountNumber: string): string {
	const clean = String(accountNumber || '').trim();
	if (clean.length <= 4) return clean;
	return `${'•'.repeat(Math.min(6, clean.length - 4))}${clean.slice(-4)}`;
}
