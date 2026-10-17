import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/**
 * Password-reset links without a token table.
 *
 * The link carries `userId.expiry.signature`, where the signature covers the user's current
 * email and password hash. It therefore stops working when it expires, and also as soon as
 * the password (or email) changes, which makes each link single-use without storing it.
 * The signing key is PASSWORD_RESET_SECRET, or one derived from CRON_SECRET under its own
 * label; with neither configured the feature stays off rather than signing with a guessable key.
 */

export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

/** The emailed link is exchanged for this httpOnly cookie and a clean URL before any page script
 * runs, so the reset code never reaches analytics (which record full URLs) or a Referer header. */
export const PASSWORD_RESET_COOKIE = 'fa_pw_reset';

export interface PasswordResetSubject {
	id: string;
	email: string | null;
	passwordHash: string | null;
}

function resetKey(): Buffer | null {
	const dedicated = String(env.PASSWORD_RESET_SECRET ?? '').trim();
	if (dedicated) return Buffer.from(dedicated, 'utf8');
	const cron = String(env.CRON_SECRET ?? '').trim();
	return cron ? createHmac('sha256', cron).update('fastaccs:password-reset:v1').digest() : null;
}

export function isPasswordResetConfigured(): boolean {
	return resetKey() !== null;
}

function sign(key: Buffer, user: PasswordResetSubject, expiresAt: number): Buffer {
	return createHmac('sha256', key)
		.update(
			`${user.id}|${expiresAt}|${(user.email ?? '').trim().toLowerCase()}|${user.passwordHash ?? ''}`
		)
		.digest();
}

export function createPasswordResetToken(
	user: PasswordResetSubject,
	now: number = Date.now()
): string | null {
	const key = resetKey();
	if (!key) return null;
	const expiresAt = Math.floor((now + PASSWORD_RESET_TTL_MS) / 1000);
	const id = Buffer.from(user.id, 'utf8').toString('base64url');
	return `${id}.${expiresAt}.${sign(key, user, expiresAt).toString('base64url')}`;
}

/** Read the user id from a link without trusting it; verify against the loaded user next. */
export function readPasswordResetUserId(token: unknown): string | null {
	if (typeof token !== 'string' || token.length > 512) return null;
	const parts = token.split('.');
	if (parts.length !== 3 || !/^\d{1,12}$/.test(parts[1])) return null;
	try {
		const userId = Buffer.from(parts[0], 'base64url').toString('utf8');
		return /^[0-9a-f-]{36}$/i.test(userId) ? userId : null;
	} catch {
		return null;
	}
}

export function verifyPasswordResetToken(
	token: unknown,
	user: PasswordResetSubject,
	now: number = Date.now()
): boolean {
	const key = resetKey();
	if (!key || readPasswordResetUserId(token) !== user.id) return false;
	const [, expiry, signature] = (token as string).split('.');
	const expiresAt = Number(expiry);
	if (!Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= now) return false;
	const expected = sign(key, user, expiresAt);
	let provided: Buffer;
	try {
		provided = Buffer.from(signature, 'base64url');
	} catch {
		return false;
	}
	return provided.length === expected.length && timingSafeEqual(provided, expected);
}
