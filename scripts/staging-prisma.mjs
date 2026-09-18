import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const action = process.argv[2];
if (!['status', 'deploy', 'verify', 'dev'].includes(action)) {
	console.error('[staging-db] Use status, deploy, verify, or dev.');
	process.exit(1);
}

function databaseTarget(name, value) {
	if (!value?.trim()) {
		throw new Error(`${name} is not configured.`);
	}
	let url;
	try {
		url = new URL(value.trim());
	} catch {
		throw new Error(`${name} is not a valid database URL.`);
	}
	if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
		throw new Error(`${name} must be a PostgreSQL URL.`);
	}
	return {
		url: value.trim(),
		hostname: url.hostname.toLowerCase(),
		branchHost: url.hostname.toLowerCase().replace('-pooler.', '.')
	};
}

try {
	const productionPool = databaseTarget('DATABASE_URL', process.env.DATABASE_URL);
	const productionDirect = databaseTarget('DIRECT_URL', process.env.DIRECT_URL);
	const stagingPool = databaseTarget('STAGING_DATABASE_URL', process.env.STAGING_DATABASE_URL);
	const stagingDirect = databaseTarget('STAGING_DIRECT_URL', process.env.STAGING_DIRECT_URL);

	if (productionPool.branchHost !== productionDirect.branchHost) {
		throw new Error('Production pooled and direct URLs do not identify the same branch.');
	}
	if (stagingPool.branchHost !== stagingDirect.branchHost) {
		throw new Error('Staging pooled and direct URLs do not identify the same branch.');
	}
	if (stagingDirect.branchHost === productionDirect.branchHost) {
		throw new Error('Staging resolves to the production branch. Refusing to continue.');
	}

	console.log(`[staging-db] Target verified: ${stagingDirect.hostname}`);
	const isNodeAction = action === 'verify' || action === 'dev';
	const command = isNodeAction
		? process.execPath
		: fileURLToPath(new URL('../node_modules/.bin/prisma', import.meta.url));
	const args =
		action === 'verify'
			? [fileURLToPath(new URL('./verify-boosting-foundation.mjs', import.meta.url))]
			: action === 'dev'
				? [process.env.npm_execpath, 'run', 'dev', '--', ...process.argv.slice(3)]
				: ['migrate', action];
	if (action === 'dev' && !process.env.npm_execpath) {
		throw new Error('Run staging development through npm run dev:staging.');
	}
	const result = spawnSync(command, args, {
		cwd: fileURLToPath(new URL('..', import.meta.url)),
		env: {
			...process.env,
			// Short, read-only integrity probes are more reliable through Neon's direct
			// endpoint. The app/dev server still exercises the pooled endpoint it deploys with.
			DATABASE_URL: action === 'verify' ? stagingDirect.url : stagingPool.url,
			DIRECT_URL: stagingDirect.url,
			FASTACCS_LOCAL_DATA_MODE: 'staging'
		},
		stdio: 'inherit'
	});
	if (result.error) throw result.error;
	process.exitCode = result.status ?? 1;
} catch (error) {
	console.error(`[staging-db] ${error instanceof Error ? error.message : 'Validation failed.'}`);
	process.exitCode = 1;
}
