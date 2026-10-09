import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Rehearse the SQL against the separate staging branch, then ROLLBACK. This does not
// apply migrations or fabricate Prisma migration history. Production is never a target.
function target(name) {
	if (!process.env[name]) throw new Error(`${name} is not configured.`);
	const url = new URL(process.env[name]);
	if (!['postgres:', 'postgresql:'].includes(url.protocol))
		throw new Error('Invalid database protocol.');
	return { url, branch: url.hostname.replace('-pooler.', '.') };
}
const production = target('DIRECT_URL');
const productionPool = target('DATABASE_URL');
const staging = target('STAGING_DIRECT_URL');
const stagingPool = target('STAGING_DATABASE_URL');
if (
	production.branch !== productionPool.branch ||
	staging.branch !== stagingPool.branch ||
	staging.branch === production.branch
)
	throw new Error('Separate staging branch verification failed.');

const bin = process.env.PG_BIN_DIR || '/opt/homebrew/opt/libpq/bin';
const childEnv = {
	...process.env,
	PGHOST: staging.url.hostname,
	PGPORT: staging.url.port || '5432',
	PGUSER: decodeURIComponent(staging.url.username),
	PGPASSWORD: decodeURIComponent(staging.url.password),
	PGDATABASE: decodeURIComponent(staging.url.pathname.slice(1)),
	PGSSLMODE: 'verify-full',
	PGSSLROOTCERT: 'system',
	PGCONNECT_TIMEOUT: '15',
	PGOPTIONS: '-c statement_timeout=30000 -c lock_timeout=5000'
};
// Address override is scoped to libpq; original PGHOST still drives TLS identity/SNI.
const answers = await Promise.all([
	fetch(`https://dns.google/resolve?name=${encodeURIComponent(staging.url.hostname)}&type=A`, {
		signal: AbortSignal.timeout(10000)
	}).then((r) => r.json()),
	fetch(
		`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(staging.url.hostname)}&type=A`,
		{ headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) }
	).then((r) => r.json())
]);
if (answers.some((r) => r.Status !== 0)) throw new Error('Independent staging DNS lookup failed.');
const addresses = answers.map((r) =>
	(r.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data)
);
const address = addresses[0].find((ip) => addresses[1].includes(ip));
if (!address) throw new Error('Independent DNS resolvers did not agree.');
childEnv.PGHOSTADDR = address;

function query(sql) {
	const result = spawnSync(
		`${bin}/psql`,
		['--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align'],
		{ env: childEnv, input: sql, encoding: 'utf8', timeout: 120000 }
	);
	if (result.status !== 0)
		throw new Error(
			`Staging rehearsal stopped (${result.error?.code || result.status}). No production migration was attempted; an open rehearsal transaction rolls back on disconnect.`
		);
	return result.stdout.trim();
}
const applied = JSON.parse(
	query(`SELECT COALESCE(json_agg(migration_name), '[]'::json)
  FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`)
);
const names = [
	'20261007193000_add_payment_webhook_inbox',
	'20261007200000_add_refund_recovery_tasks',
	'20261008220000_add_boost_refill_tracking'
];
const pending = names.filter((name) => !applied.includes(name));
const snapshotSql = `SELECT json_build_object(
  'webhookInbox', to_regclass('public.payment_webhook_inbox') IS NOT NULL,
  'refundRecovery', to_regclass('public.refund_recovery_tasks') IS NOT NULL,
  'refillColumns', (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public'
    AND table_name = 'boost_complaints' AND column_name IN
    ('refill_state', 'refill_checked_at', 'refill_next_check_at', 'refill_poll_failures', 'refill_lease_token', 'refill_lease_expires_at')));`;
const before = JSON.parse(query(snapshotSql));
const sql = await Promise.all(
	pending.map((name) =>
		readFile(
			fileURLToPath(new URL(`../prisma/migrations/${name}/migration.sql`, import.meta.url)),
			'utf8'
		)
	)
);
const output = query(`BEGIN;\n${sql.join('\n')}\n${snapshotSql}\nROLLBACK;`);
const snapshotLine = output.split('\n').find((line) => line.startsWith('{'));
const rehearsed = JSON.parse(snapshotLine || 'null');
if (!rehearsed?.webhookInbox || !rehearsed.refundRecovery || rehearsed.refillColumns !== 6)
	throw new Error('Expected safety schema was not present inside the rehearsal.');
const after = JSON.parse(query(snapshotSql));
if (JSON.stringify(before) !== JSON.stringify(after))
	throw new Error('Staging schema did not return to its original state.');
console.log(
	JSON.stringify(
		{
			mode: 'separate-staging-sql-rehearsal',
			pending,
			rehearsed,
			rollbackVerified: true,
			prismaMigrationsApplied: false,
			productionChanged: false
		},
		null,
		2
	)
);
