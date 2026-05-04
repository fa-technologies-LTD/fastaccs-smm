import { describe, expect, it } from 'vitest';
import {
	buildCsvHeaderDescriptors,
	normalizeAccountDataForPersistence,
	parseKnownAccountFieldValue,
	resolveKnownAccountField
} from './account-credentials';

describe('account-credentials helper', () => {
	it('maps known fields and leaves custom CSV fields unmapped', () => {
		const descriptors = buildCsvHeaderDescriptors([
			'Email',
			'Password',
			'2FA Link',
			'Token',
			'Custom URL',
			'Followers'
		]);

		expect(descriptors.map((entry) => entry.knownField)).toEqual([
			'email',
			'password',
			'twoFa',
			null,
			null,
			'followers'
		]);
		expect(resolveKnownAccountField('email pass')).toBe('emailPassword');
	});

	it('parses numeric and boolean known values for agnostic CSV imports', () => {
		expect(parseKnownAccountFieldValue('followers', '1,200')).toMatchObject({
			ok: true,
			value: 1200
		});
		expect(parseKnownAccountFieldValue('engagementRate', '5.4%')).toMatchObject({
			ok: true,
			value: 5.4
		});
		expect(parseKnownAccountFieldValue('twoFactorEnabled', 'yes')).toMatchObject({
			ok: true,
			value: true
		});
		expect(parseKnownAccountFieldValue('qualityScore', '11')).toMatchObject({
			ok: false
		});
	});

	it('keeps unknown account fields as credential extras without dropping known fields', () => {
		const normalized = normalizeAccountDataForPersistence({
			username: 'demo_user',
			password: 'secret',
			link_url: 'www.example.com/login',
			access_token: 'token_123',
			backup_code: 4242,
			credential_extras: {
				'Recovery Email': 'backup@example.com'
			}
		});

		expect(normalized.username).toBe('demo_user');
		expect(normalized.password).toBe('secret');
		expect(normalized.linkUrl).toBe('https://www.example.com/login');
		expect(normalized.credentialExtras).toEqual({
			'Recovery Email': 'backup@example.com',
			access_token: 'token_123',
			backup_code: '4242'
		});
	});
});
