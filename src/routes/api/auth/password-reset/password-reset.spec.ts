import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	updateMany: vi.fn(),
	sendEmail: vi.fn(),
	invalidateUserSessions: vi.fn(),
	checkRateLimit: vi.fn(),
	recordRateLimitAttempt: vi.fn(),
	hashPassword: vi.fn()
}));

vi.mock('$env/dynamic/private', () => ({ env: { CRON_SECRET: 'cron-secret-for-tests' } }));
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_BASE_URL: 'https://smm.fastaccs.com' } }));
vi.mock('$lib/prisma', () => ({
	prisma: { user: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } }
}));
vi.mock('$lib/services/email', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('$lib/auth/session', () => ({ invalidateUserSessions: mocks.invalidateUserSessions }));
vi.mock('$lib/auth/password', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/auth/password')>()),
	hashPassword: mocks.hashPassword
}));
vi.mock('$lib/auth/rate-limit', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/auth/rate-limit')>()),
	checkRateLimit: mocks.checkRateLimit,
	recordRateLimitAttempt: mocks.recordRateLimitAttempt
}));

import { POST as requestReset } from './request/+server';
import { POST as confirmReset } from './confirm/+server';
import { load as resetPageLoad } from '../../../auth/reset-password/+page.server';
import { PASSWORD_RESET_COOKIE, createPasswordResetToken } from '$lib/server/password-reset';

const passwordUser = {
	id: '6a0f1c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b',
	email: 'buyer@example.com',
	passwordHash: 'salt:old-hash',
	googleId: null,
	isActive: true,
	emailVerified: false
};

function cookieJar(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		get: (name: string) => values.get(name),
		set: vi.fn((name: string, value: string) => void values.set(name, value)),
		delete: vi.fn((name: string) => void values.delete(name))
	};
}

function post(path: string, body: unknown, cookies = cookieJar(), host = 'smm.fastaccs.com') {
	const request = new Request(`https://${host}${path}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
		body: JSON.stringify(body)
	});
	return { request, cookies, url: new URL(request.url) } as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
	mocks.recordRateLimitAttempt.mockResolvedValue(undefined);
	mocks.sendEmail.mockResolvedValue({ success: true });
	mocks.hashPassword.mockResolvedValue('salt:new-hash');
	mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe('requesting a reset link', () => {
	it('gives the same answer for unknown emails and sends nothing', async () => {
		mocks.findUnique.mockResolvedValue(null);
		const response = await requestReset(
			post('/api/auth/password-reset/request', { email: 'Nobody@Example.com' })
		);
		const result = await response.json();
		expect(response.status).toBe(200);
		expect(result.message).toMatch(/If an account exists/);
		expect(mocks.sendEmail).not.toHaveBeenCalled();
	});

	it('emails a link on the configured site, never the request host', async () => {
		mocks.findUnique.mockResolvedValue(passwordUser);
		const response = await requestReset(
			post(
				'/api/auth/password-reset/request',
				{ email: 'buyer@example.com' },
				cookieJar(),
				'evil.test'
			)
		);
		expect(response.status).toBe(200);
		const mail = mocks.sendEmail.mock.calls[0][0];
		expect(mail.to).toBe('buyer@example.com');
		expect(mail.notificationType).toBe('password_reset');
		expect(mail.ctaUrl).toMatch(/^https:\/\/smm\.fastaccs\.com\/auth\/reset-password\?token=/);
		expect(mail.ctaUrl).not.toContain('evil.test');
	});

	it('tells Google-only accounts to use Google, and skips suspended accounts', async () => {
		mocks.findUnique.mockResolvedValueOnce({
			...passwordUser,
			passwordHash: null,
			googleId: 'g-1'
		});
		await requestReset(post('/api/auth/password-reset/request', { email: 'buyer@example.com' }));
		expect(mocks.sendEmail.mock.calls[0][0].ctaUrl).toBe('https://smm.fastaccs.com/auth/login');

		mocks.findUnique.mockResolvedValueOnce({ ...passwordUser, isActive: false });
		await requestReset(post('/api/auth/password-reset/request', { email: 'buyer@example.com' }));
		expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
	});

	it('rate-limits repeated requests', async () => {
		mocks.checkRateLimit.mockResolvedValue({
			allowed: false,
			remaining: 0,
			retryAfterSeconds: 600
		});
		const response = await requestReset(
			post('/api/auth/password-reset/request', { email: 'buyer@example.com' })
		);
		expect(response.status).toBe(429);
		expect(mocks.findUnique).not.toHaveBeenCalled();
	});
});

describe('the emailed link', () => {
	it('is moved into an httpOnly cookie and a clean URL before the page renders', async () => {
		const token = createPasswordResetToken(passwordUser)!;
		const cookies = cookieJar();
		const event = {
			url: new URL(
				`https://smm.fastaccs.com/auth/reset-password?token=${encodeURIComponent(token)}`
			),
			cookies,
			setHeaders: vi.fn()
		};
		await expect(resetPageLoad(event as never)).rejects.toMatchObject({
			status: 303,
			location: '/auth/reset-password'
		});
		expect(cookies.set).toHaveBeenCalledWith(
			PASSWORD_RESET_COOKIE,
			token,
			expect.objectContaining({ httpOnly: true, path: '/' })
		);
	});
});

describe('setting the new password', () => {
	function confirmWith(token: string | null, password = 'new-password-123') {
		const cookies = cookieJar(token ? { [PASSWORD_RESET_COOKIE]: token } : {});
		return {
			cookies,
			call: confirmReset(post('/api/auth/password-reset/confirm', { password }, cookies))
		};
	}

	it('updates only the hash the link was signed for, verifies email, signs out devices', async () => {
		mocks.findUnique.mockResolvedValue(passwordUser);
		const { cookies, call } = confirmWith(createPasswordResetToken(passwordUser));
		const response = await call;
		expect(response.status).toBe(200);
		expect(mocks.updateMany).toHaveBeenCalledWith({
			where: { id: passwordUser.id, passwordHash: 'salt:old-hash' },
			data: expect.objectContaining({ passwordHash: 'salt:new-hash', emailVerified: true })
		});
		expect(mocks.invalidateUserSessions).toHaveBeenCalledWith(passwordUser.id);
		expect(cookies.delete).toHaveBeenCalledWith(PASSWORD_RESET_COOKIE, { path: '/' });
	});

	it('refuses a second (or concurrent) use of the same link', async () => {
		mocks.findUnique.mockResolvedValue(passwordUser);
		mocks.updateMany.mockResolvedValue({ count: 0 });
		const response = await confirmWith(createPasswordResetToken(passwordUser)).call;
		expect(response.status).toBe(400);
		expect(mocks.invalidateUserSessions).not.toHaveBeenCalled();
	});

	it('refuses missing, forged or stale links and short passwords', async () => {
		mocks.findUnique.mockResolvedValue(passwordUser);
		expect((await confirmWith(null).call).status).toBe(400);
		expect((await confirmWith('forged.123.abc').call).status).toBe(400);
		const stale = createPasswordResetToken(passwordUser)!;
		mocks.findUnique.mockResolvedValue({ ...passwordUser, passwordHash: 'salt:changed' });
		expect((await confirmWith(stale).call).status).toBe(400);
		expect((await confirmWith(stale, 'short').call).status).toBe(400);
		expect(mocks.updateMany).not.toHaveBeenCalled();
	});
});
