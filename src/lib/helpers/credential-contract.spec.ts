import { describe, expect, it } from 'vitest';
import { buildCredentialPlainText, getCanonicalCredentialEntries } from './credential-contract';

describe('credential-contract helper', () => {
	it('renders known fields + extras in a consistent agnostic contract', () => {
		const entries = getCanonicalCredentialEntries({
			email: 'buyer@example.com',
			password: 'P@ssw0rd!',
			twoFa: 'example.com/2fa/setup',
			credentialExtras: {
				Backup_Email: 'backup@example.com',
				custom_token: 'abc-xyz'
			}
		});

		expect(entries.map((entry) => entry.key)).toEqual([
			'password',
			'email',
			'twoFa',
			'Backup_Email',
			'custom_token'
		]);
		expect(entries.find((entry) => entry.key === 'twoFa')).toMatchObject({
			isUrl: true,
			href: 'https://example.com/2fa/setup'
		});
	});

	it('builds copy-safe plain text output for email/password-only credentials', () => {
		const text = buildCredentialPlainText(
			{
				email: 'buyer@example.com',
				password: 'P@ssw0rd!'
			},
			{
				headerLines: ['Account 1'],
				footerLines: ['Status: delivered']
			}
		);

		expect(text).toContain('Account 1');
		expect(text).toContain('Email: buyer@example.com');
		expect(text).toContain('Password: P@ssw0rd!');
		expect(text).toContain('Status: delivered');
	});

	it('hides internal exact-preview reservation metadata from rendered and copied credentials', () => {
		const record = {
			username: 'buyer_profile',
			credentialExtras: {
				exact_preview_reservation: {
					source: 'exact_preview',
					userId: 'user-id',
					displayLabel: 'Profile No 01'
				},
				exact_preview_screenshot: 'https://cdn.example.com/profile.webp',
				Recovery_Email: 'backup@example.com'
			}
		};

		const entries = getCanonicalCredentialEntries(record);
		const text = buildCredentialPlainText(record);

		expect(entries.map((entry) => entry.key)).toEqual(['username', 'Recovery_Email']);
		expect(text).toContain('Username: buyer_profile');
		expect(text).toContain('Recovery Email: backup@example.com');
		expect(text).not.toContain('Exact Preview');
		expect(text).not.toContain('[object Object]');
	});
});
