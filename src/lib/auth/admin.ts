// Admin configuration for FastAccs
import { env } from '$env/dynamic/private';

let warnedMissingAdminEmails = false;

function getConfiguredAdminEmails(): Set<string> {
	const configured = (env.ADMIN_EMAILS || '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter((email) => email.length > 0);

	if (configured.length === 0 && env.NODE_ENV === 'production' && !warnedMissingAdminEmails) {
		warnedMissingAdminEmails = true;
		console.warn(
			'[auth.admin] ADMIN_EMAILS is empty in production. No users can be auto-classified as admin.'
		);
	}

	return new Set(configured);
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
