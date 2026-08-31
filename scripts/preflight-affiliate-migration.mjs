import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
	const [duplicates, legacyLocks, bankRows, openPayoutDuplicates, structures] = await Promise.all([
		prisma.$queryRaw`
			SELECT user_id::text AS "userId", COUNT(*)::int AS count,
			       ARRAY_AGG(id::text ORDER BY created_at) AS "programIds"
			FROM affiliate_programs
			GROUP BY user_id
			HAVING COUNT(*) > 1
		`,
		prisma.$queryRaw`
			SELECT COUNT(*)::int AS count
			FROM microcopy
			WHERE category = 'affiliate_referral'
			  AND key LIKE 'affiliate.referral.lock.user.%'
		`,
		prisma.$queryRaw`
			SELECT COUNT(*)::int AS "totalRows",
			       COUNT(*) FILTER (
			         WHERE bank_name IS NULL OR account_number IS NULL OR account_name IS NULL OR phone IS NULL
			       )::int AS "incompletePlaintextRows"
			FROM affiliate_payout_details
		`,
		prisma.$queryRaw`
			SELECT user_id::text AS "userId", COUNT(*)::int AS count,
			       ARRAY_AGG(id::text ORDER BY created_at) AS "transactionIds"
			FROM wallet_transactions
			WHERE type = 'affiliate_payout' AND status IN ('requested', 'under_review')
			GROUP BY user_id
			HAVING COUNT(*) > 1
		`,
		prisma.$queryRaw`
			SELECT
			  to_regclass('public.affiliate_referrals') IS NOT NULL AS "referralsTableExists",
			  to_regclass('public.affiliate_events') IS NOT NULL AS "eventsTableExists",
			  to_regclass('public.wallet_transactions_one_open_affiliate_payout_per_user') IS NOT NULL AS "openPayoutIndexExists",
			  EXISTS (
			    SELECT 1 FROM information_schema.columns
			    WHERE table_schema = 'public'
			      AND table_name = 'affiliate_referrals'
			      AND column_name = 'policy_snapshot'
			  ) AS "referralPolicySnapshotColumnExists",
			  EXISTS (
			    SELECT 1 FROM information_schema.columns
			    WHERE table_schema = 'public'
			      AND table_name = 'affiliate_payout_details'
			      AND column_name = 'encrypted_payload'
			  ) AS "encryptedPayloadColumnExists"
		`
	]);

	const report = {
		mode: 'read-only-migration-preflight',
		generatedAt: new Date().toISOString(),
		migrationAlreadyPresent: Boolean(
			structures[0]?.referralsTableExists &&
				structures[0]?.eventsTableExists &&
				structures[0]?.referralPolicySnapshotColumnExists &&
				structures[0]?.openPayoutIndexExists &&
				structures[0]?.encryptedPayloadColumnExists
		),
		duplicateProgramUsers: duplicates,
		legacyReferralLocks: Number(legacyLocks[0]?.count || 0),
		payoutBankRows: {
			total: Number(bankRows[0]?.totalRows || 0),
			incompletePlaintext: Number(bankRows[0]?.incompletePlaintextRows || 0)
		},
		duplicateOpenPayouts: openPayoutDuplicates
	};
	console.log(JSON.stringify(report, null, 2));
	if (
		duplicates.length > 0 ||
		openPayoutDuplicates.length > 0 ||
		report.payoutBankRows.incompletePlaintext > 0
	) {
		console.error(
			'[affiliate-migration-preflight] BLOCKED: resolve the listed integrity issues before migration.'
		);
		process.exitCode = 2;
	}
} catch (error) {
	console.error('[affiliate-migration-preflight] Failed:', error);
	process.exitCode = 1;
} finally {
	await prisma.$disconnect();
}
