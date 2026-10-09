import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, openSync, closeSync, renameSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// Credentials stay in the child environment, never in arguments/logs or the backup manifest.
const filename = resolve(process.argv[2] || '');
if (!process.argv[2] || existsSync(filename) || !existsSync(dirname(filename))) {
	throw new Error('Supply a new backup filename inside an existing private directory.');
}
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required.');
const url = new URL(process.env.DIRECT_URL);
if (!['postgres:', 'postgresql:'].includes(url.protocol))
	throw new Error('Invalid database protocol.');
const bin = process.env.PG_BIN_DIR || '/opt/homebrew/opt/libpq/bin';
const childEnv = {
	...process.env,
	PGHOST: url.hostname,
	PGPORT: url.port || '5432',
	PGUSER: decodeURIComponent(url.username),
	PGPASSWORD: decodeURIComponent(url.password),
	PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
	PGSSLMODE: 'verify-full',
	PGSSLROOTCERT: 'system',
	PGCONNECT_TIMEOUT: '15',
	PGOPTIONS: '-c statement_timeout=120000 -c lock_timeout=30000'
};
if (process.argv[3] === '--verified-dns') {
	const results = await Promise.all([
		fetch(`https://dns.google/resolve?name=${encodeURIComponent(url.hostname)}&type=A`, {
			signal: AbortSignal.timeout(10000)
		}).then((r) => r.json()),
		fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=A`, {
			headers: { accept: 'application/dns-json' },
			signal: AbortSignal.timeout(10000)
		}).then((r) => r.json())
	]);
	if (results.some((r) => r.Status !== 0))
		throw new Error('Independent database DNS lookup failed.');
	const addresses = results.map((r) =>
		(r.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data)
	);
	const address = addresses[0].find((ip) => addresses[1].includes(ip));
	if (!address) throw new Error('Independent database DNS resolvers did not agree.');
	// PGHOST remains the original domain for strict certificate identity verification.
	childEnv.PGHOSTADDR = address;
} else if (process.argv[3]) throw new Error('Unknown backup option.');
closeSync(openSync(filename, 'wx', 0o600));
const dump = spawnSync(
	`${bin}/pg_dump`,
	['--format=custom', '--no-owner', '--no-acl', '--lock-wait-timeout=30000', `--file=${filename}`],
	{ env: childEnv, encoding: 'utf8', timeout: 900_000 }
);
if (dump.status !== 0) {
	renameSync(filename, `${filename}.incomplete`);
	throw new Error(
		`Database backup failed (${dump.error?.code || dump.status || 'unknown'}). Partial archive retained as .incomplete. No migrations were applied.`
	);
}
chmodSync(filename, 0o600);
const verify = spawnSync(`${bin}/pg_restore`, ['--list', filename], {
	encoding: 'utf8',
	timeout: 30_000
});
if (verify.status !== 0 || !verify.stdout.includes('TABLE DATA'))
	throw new Error('Backup archive validation failed.');
const decode = spawnSync(`${bin}/pg_restore`, ['--file=/dev/null', filename], {
	encoding: 'utf8',
	timeout: 120_000
});
if (decode.status !== 0)
	throw new Error('Backup content validation failed; do not use this archive for deployment.');
console.log(
	JSON.stringify({
		backup: filename,
		archiveValidated: true,
		restoreTested: false,
		createdAt: new Date().toISOString()
	})
);
