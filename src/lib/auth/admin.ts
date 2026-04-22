// Admin configuration for FastAccs

const ADMIN_EMAILS = ['verystrongethan@gmail.com'];

export function isAdminEmail(email: string): boolean {
	return ADMIN_EMAILS.includes(email.toLowerCase());
}

export function getAdminEmails(): string[] {
	return [...ADMIN_EMAILS];
}

// Helper to determine user type based on email
export function getUserTypeFromEmail(email: string): 'ADMIN' | 'REGISTERED' {
	return isAdminEmail(email) ? 'ADMIN' : 'REGISTERED';
}
