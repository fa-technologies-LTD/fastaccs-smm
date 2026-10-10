import { describe, expect, it } from 'vitest';
import { ACCOUNT_READY_EMAIL_SUBJECT, buildAccountReadyEmailBody } from './account-ready-email';

describe('dashboard-only account-ready email', () => {
	it('never reads credentials, including extras and access links', () => {
		const account = { id: 'account-1' };
		for (const key of [
			'username',
			'password',
			'email',
			'emailPassword',
			'twoFa',
			'linkUrl',
			'credentialExtras'
		]) {
			Object.defineProperty(account, key, {
				get: () => {
					throw new Error(`Read secret: ${key}`);
				}
			});
		}
		const body = buildAccountReadyEmailBody({
			orderNumber: 'FA-123-ABC',
			totalAmount: 1900,
			orderItems: [{ productName: 'X Account', accounts: [account] }]
		});
		expect(body).toContain('View your account details in your dashboard');
		expect(body).toContain('Amount paid: ₦1,900');
		expect(body).toContain('X Account × 1');
		expect(body.match(/FA-123-ABC/g)).toHaveLength(1);
		expect(body).not.toContain('FA-FA-');
		expect(ACCOUNT_READY_EMAIL_SUBJECT).toBe('Your order is ready');
	});

	it.each(['ORD-123-ABC', 'FA-123-ABC', '123-ABC'])(
		'uses one consistent reference for %s',
		(orderNumber) => {
			const body = buildAccountReadyEmailBody({ orderNumber, totalAmount: 500, orderItems: [] });
			expect(body).toContain('Order: FA-123-ABC');
			expect(body.match(/FA-123-ABC/g)).toHaveLength(1);
		}
	);
});
