import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedNativeStagingUrl } from './verified-native-staging.mjs';

const environment = () => ({
	DIRECT_URL: 'postgresql://test:test@ep-production.neon.tech/test',
	DATABASE_URL: 'postgresql://test:test@ep-production-pooler.neon.tech/test',
	STAGING_DIRECT_URL:
		'postgresql://test:test@ep-staging.neon.tech/test?sslmode=disable&sslaccept=accept_invalid_certs',
	STAGING_DATABASE_URL: 'postgresql://test:test@ep-staging-pooler.neon.tech/test'
});
test('requires strict TLS, bounds the local pool, and leaves original settings untouched', () => {
	const source = environment();
	const url = new URL(verifiedNativeStagingUrl(source));
	assert.equal(url.hostname, 'ep-staging.neon.tech');
	assert.equal(url.searchParams.get('sslmode'), 'require');
	assert.equal(url.searchParams.get('sslaccept'), 'strict');
	assert.equal(url.searchParams.get('connection_limit'), '8');
	assert.match(source.STAGING_DIRECT_URL, /sslmode=disable/);
});
test('rejects a staging URL that points to production', () => {
	const source = environment();
	assert.throws(() =>
		verifiedNativeStagingUrl({
			...source,
			STAGING_DIRECT_URL: source.DIRECT_URL,
			STAGING_DATABASE_URL: source.DATABASE_URL
		})
	);
});
test('rejects mismatched pooled/direct branches', () => {
	assert.throws(() =>
		verifiedNativeStagingUrl({
			...environment(),
			STAGING_DATABASE_URL: 'postgresql://test:test@ep-other.neon.tech/test'
		})
	);
});
test('rejects missing or non-PostgreSQL staging configuration', () => {
	assert.throws(() => verifiedNativeStagingUrl({ ...environment(), STAGING_DIRECT_URL: '' }));
	assert.throws(() =>
		verifiedNativeStagingUrl({
			...environment(),
			STAGING_DIRECT_URL: 'https://ep-staging.neon.tech/test'
		})
	);
});
