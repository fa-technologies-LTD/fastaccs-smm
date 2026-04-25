import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const HASH_KEY_LENGTH = 64;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export function getPasswordByteLength(password: string): number {
	return new TextEncoder().encode(password).length;
}

export function isPasswordTooLong(password: string): boolean {
	return getPasswordByteLength(password) > MAX_PASSWORD_BYTES;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16).toString('hex');
	const derivedKey = (await scrypt(password, salt, HASH_KEY_LENGTH)) as Buffer;
	return `${salt}:${derivedKey.toString('hex')}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	const [salt, hashHex] = storedHash.split(':');
	if (!salt || !hashHex) return false;

	const derivedKey = (await scrypt(password, salt, HASH_KEY_LENGTH)) as Buffer;
	const storedBuffer = Buffer.from(hashHex, 'hex');

	if (derivedKey.length !== storedBuffer.length) {
		return false;
	}

	return timingSafeEqual(derivedKey, storedBuffer);
}
