// Account type definition
import { resolveCredentialField } from '$lib/helpers/credential-links';

type Account = {
	username: string | null;
	password: string | null;
	email?: string | null;
	emailPassword?: string | null;
	twoFa?: string | null;
	linkUrl?: string | null;
};

// Format price to Nigerian Naira
export function formatPrice(price: number): string {
	return new Intl.NumberFormat('en-NG', {
		style: 'currency',
		currency: 'NGN',
		minimumFractionDigits: 0
	}).format(price);
}

export function formatDate(date: string | Date): string {
	const dateObj = typeof date === 'string' ? new Date(date) : date;
	return dateObj.toLocaleDateString('en-NG', {
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

// Copy to clipboard utilities
export async function copyToClipboard(
	text: string,
	options?: {
		successMessage?: string;
		label?: string;
		showToast?: (toast: {
			type: 'success' | 'error' | 'warning' | 'info';
			title: string;
			message?: string;
			duration?: number;
		}) => void;
	}
): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		if (options?.showToast) {
			options.showToast({
				type: 'success',
				title:
					options.successMessage || options.label
						? `${options.label || 'Content'} copied to clipboard!`
						: 'Copied to clipboard!',
				duration: 2000
			});
		}
		return true;
	} catch {
		if (options?.showToast) {
			options.showToast({
				type: 'error',
				title: 'Failed to copy to clipboard',
				duration: 2000
			});
		}
		return false;
	}
}

export function copyAccountDetails(
	account: Account,
	options?: {
		showToast?: (toast: {
			type: 'success' | 'error' | 'warning' | 'info';
			title: string;
			message?: string;
			duration?: number;
		}) => void;
	}
): void {
	const twoFa = resolveCredentialField(account.twoFa);
	const link = resolveCredentialField(account.linkUrl);
	let details = `Username: ${account.username}\nPassword: ${account.password}`;
	if (account.email) details += `\nEmail: ${account.email}`;
	if (account.emailPassword) details += `\nEmail Password: ${account.emailPassword}`;
	if (twoFa.display) details += `\n2FA: ${twoFa.display}`;
	if (link.display) details += `\nLink: ${link.display}`;

	copyToClipboard(details, {
		successMessage: 'Account details copied to clipboard!',
		showToast: options?.showToast
	});
}

export function copyAllAccounts(
	accounts: Account[],
	options?: {
		showToast?: (toast: {
			type: 'success' | 'error' | 'warning' | 'info';
			title: string;
			message?: string;
			duration?: number;
		}) => void;
	}
): void {
	const allDetails = accounts
		.map((account, index) => {
			const twoFa = resolveCredentialField(account.twoFa);
			const link = resolveCredentialField(account.linkUrl);
			let details = `Account ${index + 1}:\nUsername: ${account.username}\nPassword: ${account.password}`;
			if (account.email) details += `\nEmail: ${account.email}`;
			if (account.emailPassword) details += `\nEmail Password: ${account.emailPassword}`;
			if (twoFa.display) details += `\n2FA: ${twoFa.display}`;
			if (link.display) details += `\nLink: ${link.display}`;
			return details;
		})
		.join('\n\n');

	copyToClipboard(allDetails, {
		successMessage: `Copied ${accounts.length} account(s) to clipboard!`,
		showToast: options?.showToast
	});
}

// CSV Export utility
export function exportToCSV(
	data: Record<string, unknown>[],
	filename: string,
	headers?: string[]
): void {
	if (!data || data.length === 0) return;

	// Auto-generate headers from first object keys if not provided
	const csvHeaders = headers || Object.keys(data[0]);

	// Convert data to CSV rows
	const rows = data.map((item) =>
		csvHeaders.map((header) => {
			const value = item[header];
			const cellStr = String(value ?? '');
			// Escape quotes and wrap in quotes if contains comma, quote, or newline
			if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
				return `"${cellStr.replace(/"/g, '""')}"`;
			}
			return cellStr;
		})
	);

	// Combine headers and rows
	const csvContent = [csvHeaders.join(','), ...rows.map((row) => row.join(','))].join('\n');

	// Create and trigger download
	const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');

	link.setAttribute('href', url);
	link.setAttribute('download', filename);
	link.style.visibility = 'hidden';

	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
