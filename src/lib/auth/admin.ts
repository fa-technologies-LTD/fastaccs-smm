// Admin configuration for FastAccs
import { env } from '$env/dynamic/private';

const DEFAULT_ADMIN_EMAILS = ['verystrongethan@gmail.com'];

function getConfiguredAdminEmails(): Set<string> {
	const configured = (env.ADMIN_EMAILS || '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter((email) => email.length > 0);

	return new Set([...DEFAULT_ADMIN_EMAILS, ...configured]);
}

export function isAdminEmail(email: string): boolean {
	return getConfiguredAdminEmails().has(email.toLowerCase());
}

export function getAdminEmails(): string[] {
	return Array.from(getConfiguredAdminEmails());
}

// Helper to determine user type based on email
export function getUserTypeFromEmail(email: string): 'ADMIN' | 'REGISTERED' {
	return isAdminEmail(email) ? 'ADMIN' : 'REGISTERED';
}
