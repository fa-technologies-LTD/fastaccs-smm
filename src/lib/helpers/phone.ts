// Shared phone validation for the optional WhatsApp field (client + server).
// Optional overall, but if a value is given it must look like a real phone
// number — this keeps bot/garbage values (e.g. "bnYZzLiRajxhODK") out of the DB.

const PHONE_ALLOWED = /^[+\d\s().-]+$/;

/**
 * Returns the trimmed phone string if it looks like a valid phone number,
 * otherwise null (empty, contains letters, disallowed characters, or a digit
 * count outside 7–15). Use this on the server so invalid input is stored as null.
 */
export function sanitizePhone(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (!PHONE_ALLOWED.test(trimmed)) return null;
	const digits = trimmed.replace(/\D/g, '');
	if (digits.length < 7 || digits.length > 15) return null;
	return trimmed;
}

/** True if the value is a valid phone number. Use for client-side form validation. */
export function isValidPhone(value: string): boolean {
	return sanitizePhone(value) !== null;
}
