/** Account-ready emails carry public order summaries only, never account credentials. */
export interface AccountReadyEmailSummary {
	orderNumber: string;
	totalAmount: unknown;
	orderItems: Array<{ productName: string; accounts: Array<{ id: string }> }>;
}

export const ACCOUNT_READY_EMAIL_SUBJECT = 'Your order is ready';

export function buildAccountReadyEmailBody(order: AccountReadyEmailSummary): string {
	const reference = `FA-${order.orderNumber.replace(/^(?:ORD|FA)-?/i, '')}`;
	const items = order.orderItems
		.filter((item) => item.accounts.length > 0)
		.map((item) => `- ${item.productName} × ${item.accounts.length}`);
	return [
		'Your order is ready. View your account details in your dashboard.',
		'',
		`Order: ${reference}`,
		`Amount paid: ₦${Number(order.totalAmount).toLocaleString('en-US')}`,
		'',
		...items,
		'',
		'For your security, login details are not included in emails.',
		'Sign in with the email you used at checkout to view them.'
	].join('\n');
}
