import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { spawn, spawnSync } from 'node:child_process';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createVerifiedProductionBridge } from './verified-staging-bridge.mjs';

const expected = [
	'20261007193000_add_payment_webhook_inbox',
	'20261007200000_add_refund_recovery_tasks',
	'20261008220000_add_boost_refill_tracking'
];
const mode = process.argv[2];
if (!['--check', '--apply'].includes(mode)) throw new Error('Use --check or --apply BACKUP.');
const backup = process.argv[3];
if (mode === '--apply') {
	if (!backup) throw new Error('Fresh validated backup required.');
	const info = await stat(backup);
	if (Date.now() - info.mtimeMs > 24 * 60 * 60 * 1000 || info.size < 1000 || info.mode & 0o077)
		throw new Error('Backup must be private, nonempty and less than 24 hours old.');
	for (const args of [
		['--list', backup],
		['--file=/dev/null', backup]
	]) {
		const result = spawnSync('/opt/homebrew/opt/libpq/bin/pg_restore', args, {
			encoding: 'utf8',
			timeout: 120000
		});
		if (result.status !== 0 || (args[0] === '--list' && !result.stdout.includes('TABLE DATA')))
			throw new Error('Backup archive validation failed.');
	}
}
let bridge, db;
try {
	bridge = await createVerifiedProductionBridge();
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	const history =
		await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
	if (history.some((row) => !row.finished_at && !row.rolled_back_at))
		throw new Error('An unfinished migration requires operator review.');
	const applied = new Set(
		history.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name)
	);
	const directories = (await readdir(resolve('prisma/migrations'), { withFileTypes: true }))
		.filter((row) => row.isDirectory())
		.map((row) => row.name)
		.sort();
	const pending = directories.filter((name) => !applied.has(name));
	if (pending.some((name) => !expected.includes(name)))
		throw new Error('Unexpected pending migration; refusing expanded release scope.');
	console.log(
		JSON.stringify({ mode, pending, trustedRemoteTls: bridge.verifiedTlsConnections() > 0 })
	);
	await db.$disconnect();
	db = null;
	if (mode === '--apply' && pending.length) {
		const result = await new Promise((done, reject) => {
			const child = spawn(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], {
				env: { ...process.env, DATABASE_URL: bridge.url, DIRECT_URL: bridge.url },
				stdio: ['ignore', 'pipe', 'pipe']
			});
			let output = '';
			child.stdout.on('data', (chunk) => {
				output += chunk;
			});
			child.stderr.on('data', (chunk) => {
				output += chunk;
			});
			child.once('error', reject);
			child.once('close', (code) => done({ code, output }));
		});
		await writeFile('/private/tmp/fastaccs-production-migration-deploy.log', result.output, {
			mode: 0o600
		});
		if (result.code !== 0)
			throw new Error('Prisma deployment failed; inspect the private migration log.');
	}
	if (mode === '--apply') {
		db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
		const after =
			await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
		if (expected.some((name) => !after.some((row) => row.migration_name === name)))
			throw new Error('Safety migration history verification failed.');
		const schema =
			await db.$queryRaw`SELECT to_regclass('public.payment_webhook_inbox') IS NOT NULL AS inbox,
			to_regclass('public.refund_recovery_tasks') IS NOT NULL AS recovery,
			(SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='boost_complaints'
			AND column_name IN ('refill_state','refill_checked_at','refill_next_check_at','refill_poll_failures','refill_lease_token','refill_lease_expires_at')) AS refill_columns`;
		if (!schema[0]?.inbox || !schema[0]?.recovery || schema[0]?.refill_columns !== 6)
			throw new Error('Deployed safety schema verification failed.');
		console.log(JSON.stringify({ appliedAndVerified: expected, schema: schema[0] }));
	}
} catch (error) {
	console.error(
		JSON.stringify({
			error: 'Production migration gate stopped',
			reason: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')
		})
	);
	process.exitCode = 1;
} finally {
	await db?.$disconnect();
	await bridge?.close();
}
