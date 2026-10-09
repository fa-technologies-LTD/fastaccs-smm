import 'dotenv/config';
import net from 'node:net';
import tls from 'node:tls';
import { pathToFileURL } from 'node:url';

// Only loopback is plaintext. The remote PostgreSQL connection verifies the original
// staging hostname and trusted CA over TLS. Credentials/URLs are never logged.
export async function createVerifiedStagingBridge() {
	return createVerifiedDatabaseBridge('staging');
}

// Operational release scripts must validate a fresh backup before using this target for writes.
export async function createVerifiedProductionBridge() {
	return createVerifiedDatabaseBridge('production');
}

async function createVerifiedDatabaseBridge(mode) {
	const target = (name) => {
		if (!process.env[name]) throw new Error(`${name} required.`);
		const url = new URL(process.env[name]);
		if (!['postgres:', 'postgresql:'].includes(url.protocol))
			throw new Error('Invalid DB protocol.');
		return { url, branch: url.hostname.toLowerCase().replace('-pooler.', '.') };
	};
	const production = target('DIRECT_URL'),
		productionPool = target('DATABASE_URL');
	const staging = target('STAGING_DIRECT_URL'),
		stagingPool = target('STAGING_DATABASE_URL');
	if (
		production.branch !== productionPool.branch ||
		staging.branch !== stagingPool.branch ||
		staging.branch === production.branch
	)
		throw new Error('Distinct staging branch verification failed.');
	const selected = mode === 'production' ? production : staging;
	const answers = await Promise.all([
		fetch(`https://dns.google/resolve?name=${encodeURIComponent(selected.url.hostname)}&type=A`, {
			signal: AbortSignal.timeout(10000)
		}).then((r) => r.json()),
		fetch(
			`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(selected.url.hostname)}&type=A`,
			{ headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(10000) }
		).then((r) => r.json())
	]);
	if (answers.some((row) => row.Status !== 0))
		throw new Error('Independent database DNS lookup failed.');
	const addresses = answers.map((row) =>
		(row.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data)
	);
	const address = addresses[0].find((ip) => addresses[1].includes(ip));
	if (!address) throw new Error('Independent DNS resolvers did not agree.');
	const sockets = new Set();
	let verifiedTlsConnections = 0;
	const server = net.createServer((local) => {
		local.pause();
		sockets.add(local);
		let secure;
		const remote = net.connect({ host: address, port: Number(selected.url.port || 5432) });
		sockets.add(remote);
		const fail = () => {
			local.destroy();
			secure?.destroy();
			remote.destroy();
		};
		const timeout = setTimeout(fail, 15000);
		local.on('error', fail);
		remote.on('error', fail);
		local.once('close', () => {
			clearTimeout(timeout);
			sockets.delete(local);
			secure?.destroy();
			remote.destroy();
		});
		remote.once('close', () => sockets.delete(remote));
		remote.once('connect', () => remote.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47])));
		remote.once('data', (reply) => {
			if (reply.length !== 1 || reply[0] !== 83) {
				fail();
				return;
			}
			secure = tls.connect(
				{ socket: remote, servername: selected.url.hostname, rejectUnauthorized: true },
				() => {
					if (!secure.authorized) {
						fail();
						return;
					}
					verifiedTlsConnections++;
					clearTimeout(timeout);
					local.pipe(secure).pipe(local);
					local.resume();
				}
			);
			secure.on('error', fail);
			secure.once('close', () => local.destroy());
		});
	});
	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});
	const url = new URL(selected.url);
	url.hostname = '127.0.0.1';
	url.port = String(server.address().port);
	for (const key of [
		'sslrootcert',
		'sslcert',
		'sslidentity',
		'sslaccept',
		'channel_binding',
		'pgbouncer'
	])
		url.searchParams.delete(key);
	url.searchParams.set('sslmode', 'disable');
	url.searchParams.set('connection_limit', '4');
	url.searchParams.set('connect_timeout', '15');
	url.searchParams.set('pool_timeout', '30');
	return {
		url: url.toString(),
		verifiedTlsConnections: () => verifiedTlsConnections,
		close: async () => {
			for (const socket of sockets) socket.destroy();
			await new Promise((resolve) => server.close(resolve));
		}
	};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	if (process.argv[2] !== '--probe') throw new Error('Read-only --probe only.');
	let bridge, db;
	try {
		bridge = await createVerifiedStagingBridge();
		const { PrismaClient } = await import('@prisma/client');
		db = new PrismaClient({ datasources: { db: { url: bridge.url } } });
		const probe = await db.$queryRaw`SELECT 1 AS ok`;
		console.log(
			JSON.stringify({
				separateStaging: true,
				readOnly: true,
				probe,
				verifiedTlsConnections: bridge.verifiedTlsConnections()
			})
		);
	} catch (error) {
		console.error(
			JSON.stringify({
				error: 'Verified staging probe failed',
				code: error?.code ?? error?.errorCode ?? null
			})
		);
		process.exitCode = 1;
	} finally {
		await db?.$disconnect();
		await bridge?.close();
	}
}
