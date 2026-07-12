export const ADMIN_MONEY_VISIBILITY_KEY = 'fastaccs-admin-hide-monetary-amounts';

export function maskMoneyText(formattedAmount: string): string {
	return formattedAmount.replace(/[0-9]/g, '•');
}

export function formatAdminMoney(
	amount: number,
	options: {
		// Whether the current admin may see THIS amount. Per-order surfaces pass
		// canViewOrderAmounts; aggregate/lifetime surfaces pass canViewRevenue.
		canView: boolean;
		hideMonetaryAmounts: boolean;
		format: (value: number) => string;
	}
): string {
	if (!options.canView) {
		return '*';
	}

	const formatted = options.format(amount);
	return options.hideMonetaryAmounts ? maskMoneyText(formatted) : formatted;
}
