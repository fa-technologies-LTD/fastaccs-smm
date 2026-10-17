import 'dotenv/config';

export function verifiedNativeStagingUrl(environment = process.env) {
	const target = (name) => {
		const url = new URL(environment[name] || '');
		if (!['postgres:', 'postgresql:'].includes(url.protocol))
			throw new Error('PostgreSQL URL required.');
		return { url, branch: url.hostname.toLowerCase().replace('-pooler.', '.') };
	};
	const production = target('DIRECT_URL');
	const productionPool = target('DATABASE_URL');
	const staging = target('STAGING_DIRECT_URL');
	const stagingPool = target('STAGING_DATABASE_URL');
	if (
		production.branch !== productionPool.branch ||
		staging.branch !== stagingPool.branch ||
		staging.branch === production.branch
	)
		throw new Error('Distinct production and staging branches must be verified.');
	staging.url.searchParams.set('sslmode', 'require');
	staging.url.searchParams.set('sslaccept', 'strict');
	staging.url.searchParams.set('connection_limit', '8');
	staging.url.searchParams.set('connect_timeout', '15');
	staging.url.searchParams.set('pool_timeout', '30');
	return staging.url.toString();
}
