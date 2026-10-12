import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
	createVerifiedProductionBridge,
	createVerifiedStagingBridge
} from './verified-staging-bridge.mjs';

// A deliberately narrow release gate: the reviewed, additive marketing migration only.
const migration = '20261010120000_add_marketing_engine';
const revision = '00b9bc06603d619af796b2688799cc63714b5f45';
const target = process.argv[2];
if (!['--staging', '--production'].includes(target) || process.argv.length > 4)
	throw new Error(
		'Use --staging or --production FRESH_BACKUP. Production requires owner approval.'
	);
const filename = `prisma/migrations/${migration}/migration.sql`;
const reviewed = execFileSync('git', ['show', `${revision}:${filename}`], { encoding: 'utf8' });
if ((await readFile(filename, 'utf8')) !== reviewed)
	throw new Error('Migration differs from reviewed SQL; stop for review.');
if (target === '--production') {
	const backup = process.argv[3];
	if (!backup) throw new Error('Fresh validated production backup required.');
	const info = await stat(backup);
	if (Date.now() - info.mtimeMs > 86_400_000 || info.size < 1000 || info.mode & 0o077)
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
	bridge = await (target === '--production'
		? createVerifiedProductionBridge()
		: createVerifiedStagingBridge());
	db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	const history =
		await db.$queryRaw`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`;
	if (history.some((row) => !row.finished_at && !row.rolled_back_at))
		throw new Error('Unfinished migration requires review.');
	const applied = new Set(
		history.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name)
	);
	const dirs = (await readdir('prisma/migrations', { withFileTypes: true }))
		.filter((row) => row.isDirectory())
		.map((row) => row.name);
	const pending = dirs.filter((name) => !applied.has(name));
	if (pending.some((name) => name !== migration))
		throw new Error('Unexpected pending migration; refusing expanded scope.');
	if (pending.length) {
		const tables =
			await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('marketing_channels','marketing_spend_daily','marketing_actions')`;
		const cols =
			await db.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name IN ('source','campaign','content')`;
		if (tables.length || cols.length)
			throw new Error('Partial marketing schema exists; requires review.');
		await db.$disconnect();
		db = null;
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
		await writeFile(
			`/private/tmp/fastaccs-marketing-migration-${target.slice(2)}.log`,
			result.output,
			{ mode: 0o600 }
		);
		if (result.code !== 0) throw new Error('Prisma migration failed; inspect private log.');
		db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
	}
	const after =
		await db.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE migration_name=${migration} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`;
	const [schema] = await db.$queryRaw`SELECT
		(SELECT count(*)::int FROM pg_tables WHERE schemaname='public' AND tablename IN ('marketing_channels','marketing_spend_daily','marketing_actions')) AS tables,
		(SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name='analytics_events' AND column_name IN ('source','campaign','content')) AS columns`;
	if (after.length !== 1 || schema.tables !== 3 || schema.columns !== 3)
		throw new Error('Schema/history verification failed.');
	const [channels] = await db.$queryRaw`SELECT count(*)::int AS count FROM marketing_channels`;
	console.log(
		JSON.stringify({
			target: target.slice(2),
			migration,
			nativePrismaHistoryVerified: true,
			schema,
			configuredChannels: channels.count,
			trustedRemoteTls: bridge.verifiedTlsConnections() > 0,
			providerOrEmailCalls: 0
		})
	);
} catch (error) {
	console.error(
		JSON.stringify({
			error: 'Marketing migration gate stopped',
			reason: String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[redacted]')
		})
	);
	process.exitCode = 1;
} finally {
	await db?.$disconnect();
	await bridge?.close();
}
