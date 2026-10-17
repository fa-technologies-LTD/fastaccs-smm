import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verifiedNativeStagingUrl } from './verified-native-staging.mjs';

// Isolated staging verification; development listens on loopback only. Native TLS is strict.
const action =
	process.argv[2] === '--build'
		? 'build'
		: process.argv[2] === '--check'
			? 'check'
			: process.argv[2] === '--preview'
				? 'preview'
				: 'dev';
if (process.argv.length > (action === 'dev' ? 2 : 3) || !process.env.npm_execpath)
	throw new Error('Use the verified staging dev, build or check npm script.');
const localDatabaseUrl = new URL(verifiedNativeStagingUrl());
// Admin reports run many parallel reads. Leave room for login/session checks locally;
// the shared operational bridge and production pool configuration remain unchanged.
localDatabaseUrl.searchParams.set('connection_limit', '8');
const childEnv = {
	...process.env,
	NODE_ENV: ['build', 'preview'].includes(action) ? 'production' : 'development',
	DATABASE_URL: localDatabaseUrl.toString(),
	DIRECT_URL: localDatabaseUrl.toString(),
	FASTACCS_LOCAL_DATA_MODE: 'staging',
	BOOSTING_AUTOMATION_MODE: 'shadow'
};
for (const key of [
	'SMMRAJA_API_KEY',
	'BULKFOLLOWS_API_KEY',
	'HUBMAN_API_TOKEN',
	'PVAPINS_API_KEY',
	'MONNIFY_API_KEY',
	'MONNIFY_SECRET_KEY',
	'SMTP_HOST',
	'SMTP_USER',
	'SMTP_PASSWORD',
	'GMAIL_USER',
	'GMAIL_APP_PASSWORD',
	'RESEND_API_KEY',
	'PASSWORD_RESET_SECRET',
	'PROPELLERADS_API_TOKEN',
	'CRON_SECRET'
])
	childEnv[key] = '';
console.log(
	'[local-preview] Separate staging, verified remote TLS, loopback only. Payment, supplier and email credentials disabled.'
);
const child = spawn(
	process.execPath,
	[
		process.env.npm_execpath,
		'run',
		action,
		...(['dev', 'preview'].includes(action)
			? [
					'--',
					'--host',
					'127.0.0.1',
					'--port',
					action === 'preview' ? '5181' : '5173',
					'--strictPort'
				]
			: [])
	],
	{
		cwd: fileURLToPath(new URL('..', import.meta.url)),
		env: childEnv,
		stdio: 'inherit'
	}
);
const interrupt = () => child.kill('SIGINT');
const terminate = () => child.kill('SIGTERM');
process.once('SIGINT', interrupt);
process.once('SIGTERM', terminate);
try {
	process.exitCode = await new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 1)));
	});
} finally {
	process.off('SIGINT', interrupt);
	process.off('SIGTERM', terminate);
}
