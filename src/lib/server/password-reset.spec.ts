import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ values: {} as Record<string, string> }));
vi.mock('$env/dynamic/private', () => ({
	get env() {
		return env.values;
	}
}));

import {
	PASSWORD_RESET_TTL_MS,
	createPasswordResetToken,
	isPasswordResetConfigured,
	readPasswordResetUserId,
	verifyPasswordResetToken
} from './password-reset';

const user = {
	id: '6a0f1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
	email: 'Buyer@Example.com',
	passwordHash: 'salt:hash-1'
};
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);

describe('password reset links', () => {
	beforeEach(() => {
		env.values = { CRON_SECRET: 'cron-secret-for-tests' };
	});

	it('verifies a fresh link for the same user', () => {
		const token = createPasswordResetToken(user, NOW)!;
		expect(readPasswordResetUserId(token)).toBe(user.id);
		expect(verifyPasswordResetToken(token, user, NOW + 60_000)).toBe(true);
	});

	it('expires after 30 minutes', () => {
		const token = createPasswordResetToken(user, NOW)!;
		expect(verifyPasswordResetToken(token, user, NOW + PASSWORD_RESET_TTL_MS - 1_000)).toBe(true);
		expect(verifyPasswordResetToken(token, user, NOW + PASSWORD_RESET_TTL_MS + 1_000)).toBe(false);
	});

	it('stops working once the password or email changes (single use)', () => {
		const token = createPasswordResetToken(user, NOW)!;
		expect(verifyPasswordResetToken(token, { ...user, passwordHash: 'salt:hash-2' }, NOW)).toBe(
			false
		);
		expect(verifyPasswordResetToken(token, { ...user, email: 'other@example.com' }, NOW)).toBe(
			false
		);
	});

	it('rejects tampered, foreign and malformed links', () => {
		const token = createPasswordResetToken(user, NOW)!;
		const [id, expiry, signature] = token.split('.');
		const other = { ...user, id: '11111111-2222-4333-8444-555555555555' };
		expect(verifyPasswordResetToken(`${id}.${Number(expiry) + 3600}.${signature}`, user, NOW)).toBe(
			false
		);
		expect(verifyPasswordResetToken(`${id}.${expiry}.${signature.slice(0, -2)}AA`, user, NOW)).toBe(
			false
		);
		expect(verifyPasswordResetToken(token, other, NOW)).toBe(false);
		for (const bad of ['', 'abc', 'a.b.c', null, 42, `${id}.${expiry}`]) {
			expect(verifyPasswordResetToken(bad, user, NOW)).toBe(false);
		}
	});

	it('does not accept links signed under a different secret', () => {
		const token = createPasswordResetToken(user, NOW)!;
		env.values = { PASSWORD_RESET_SECRET: 'a-dedicated-secret' };
		expect(verifyPasswordResetToken(token, user, NOW)).toBe(false);
	});

	it('stays off without any signing secret', () => {
		env.values = {};
		expect(isPasswordResetConfigured()).toBe(false);
		expect(createPasswordResetToken(user, NOW)).toBeNull();
	});
});
