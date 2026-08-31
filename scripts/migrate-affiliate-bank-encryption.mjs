import 'dotenv/config';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const approvedFingerprint =
	process.argv.find((arg) => arg.startsWith('--approve-fingerprint='))?.split('=')[1]?.trim() || '';

function fail(message) {
	console.error(`[affiliate-bank-encryption] ${message}`);
	process.exitCode = 2;
}

function configuredKey() {
	const source = String(process.env.AFFILIATE_PAYOUT_ENCRYPTION_KEYS || '').trim();
	const first = source
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean)[0];
	if (!first) return null;
	const separator = first.indexOf(':');
	if (separator <= 0) throw new Error('Encryption keys must use key-id:base64-key entries.');
	const id = first.slice(0, separator).trim();
	const encoded = first.slice(separator + 1).trim();
	const key = Buffer.from(encoded, 'base64');
	if (!id || key.length !== 32) {
		throw new Error('The current encryption key must decode to exactly 32 bytes.');
	}
	return { id, key };
}

function rowSnapshot(row) {
	return {
		id: row.id,
		userId: row.userId,
		bankName: row.bankName,
		accountNumber: row.accountNumber,
		accountName: row.accountName,
		phone: row.phone,
		feedback: row.feedback,
		encryptedPayload: row.encryptedPayload,
		encryptionKeyId: row.encryptionKeyId,
		accountNumberLast4: row.accountNumberLast4,
		status: row.status,
		updatedAt: row.updatedAt.toISOString()
	};
}

function hash(value) {
	return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function encrypt(key, row) {
	const details = {
		bankName: row.bankName,
		accountNumber: row.accountNumber,
		accountName: row.accountName,
		phone: row.phone,
		feedback: row.feedback || null
	};
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key.key, iv);
	cipher.setAAD(Buffer.from(`fastaccs:affiliate-payout:${row.userId}:${key.id}`, 'utf8'));
	const ciphertext = Buffer.concat([
		cipher.update(Buffer.from(JSON.stringify(details), 'utf8')),
		cipher.final()
	]);
	const envelope = {
		v: 1,
		iv: iv.toString('base64'),
		tag: cipher.getAuthTag().toString('base64'),
		data: ciphertext.toString('base64')
	};
	return {
		encryptedPayload: Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64'),
		encryptionKeyId: key.id,
		accountNumberLast4: String(row.accountNumber).slice(-4)
	};
}

try {
	const rows = await prisma.affiliatePayoutDetails.findMany({
		where: { encryptedPayload: null },
		orderBy: { id: 'asc' },
		select: {
			id: true,
			userId: true,
			bankName: true,
			accountNumber: true,
			accountName: true,
			phone: true,
			feedback: true,
			encryptedPayload: true,
			encryptionKeyId: true,
			accountNumberLast4: true,
			status: true,
			updatedAt: true
		}
	});
	const incomplete = rows.filter(
		(row) => !row.bankName || !row.accountNumber || !row.accountName || !row.phone
	);
	const candidates = rows.filter(
		(row) => row.bankName && row.accountNumber && row.accountName && row.phone
	);
	const records = candidates.map((row) => ({
		id: row.id,
		userId: row.userId,
		status: row.status,
		accountNumberLast4: String(row.accountNumber).slice(-4),
		snapshotHash: hash(rowSnapshot(row))
	}));
	const fingerprint = hash(records);
	const key = configuredKey();
	const report = {
		mode: apply ? 'apply' : 'dry-run',
		generatedAt: new Date().toISOString(),
		candidateCount: records.length,
		incompleteCount: incomplete.length,
		currentKeyId: key?.id || null,
		fingerprint,
		records,
		incompleteRecords: incomplete.map((row) => ({
			id: row.id,
			userId: row.userId,
			status: row.status,
			missing: ['bankName', 'accountNumber', 'accountName', 'phone'].filter(
				(field) => !row[field]
			)
		}))
	};
	console.log(JSON.stringify(report, null, 2));

	if (incomplete.length > 0) {
		fail('Incomplete legacy rows must be reviewed before any encryption migration.');
	} else if (!apply) {
		console.log(
			`[affiliate-bank-encryption] Dry run only. To apply this exact reviewed set, rerun with --apply --approve-fingerprint=${fingerprint}`
		);
	} else if (!key) {
		fail('AFFILIATE_PAYOUT_ENCRYPTION_KEYS is required in apply mode.');
	} else if (!approvedFingerprint || approvedFingerprint !== fingerprint) {
		fail('The approved fingerprint does not match the current dry-run record set.');
	} else {
		await prisma.$transaction(
			async (tx) => {
				for (const candidate of candidates) {
					await tx.$queryRaw`SELECT id FROM affiliate_payout_details WHERE id = ${candidate.id}::uuid FOR UPDATE`;
					const live = await tx.affiliatePayoutDetails.findUnique({
						where: { id: candidate.id },
						select: {
							id: true,
							userId: true,
							bankName: true,
							accountNumber: true,
							accountName: true,
							phone: true,
							feedback: true,
							encryptedPayload: true,
							encryptionKeyId: true,
							accountNumberLast4: true,
							status: true,
							updatedAt: true
						}
					});
					if (!live || hash(rowSnapshot(live)) !== hash(rowSnapshot(candidate))) {
						throw new Error(`Record ${candidate.id} changed after the reviewed dry run.`);
					}
					const protectedDetails = encrypt(key, live);
					await tx.affiliatePayoutDetails.update({
						where: { id: live.id },
						data: {
							bankName: null,
							accountNumber: null,
							accountName: null,
							phone: null,
							feedback: null,
							...protectedDetails
						}
					});
					await tx.adminAuditLog.create({
						data: {
							action: 'affiliate_bank_details_encrypted',
							resourceType: 'affiliate_payout_details',
							resourceId: live.id,
							description: 'Legacy affiliate payout details encrypted and plaintext cleared',
							metadata: {
								migrationFingerprint: fingerprint,
								encryptionKeyId: protectedDetails.encryptionKeyId,
								accountNumberLast4: protectedDetails.accountNumberLast4
							}
						}
					});
				}
			},
			{ maxWait: 10_000, timeout: 30_000 }
		);
		console.log(
			`[affiliate-bank-encryption] Applied ${candidates.length} reviewed record(s); legacy plaintext was cleared.`
		);
	}
} catch (error) {
	console.error('[affiliate-bank-encryption] Failed:', error);
	process.exitCode = 1;
} finally {
	await prisma.$disconnect();
}
