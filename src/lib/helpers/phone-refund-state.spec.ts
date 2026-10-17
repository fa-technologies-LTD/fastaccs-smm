import { expect, it } from 'vitest';
import { isPhoneRefundConfirmed } from './phone-refund-state';
it('requires both the committed rental refund and sufficient recorded refunded amount for a registered buyer', () => {
	const rental = { refundedAt: new Date(), saleAmountNgn: 500 };
	const order = { userId: 'buyer', refundedAmount: 500 };
	expect(isPhoneRefundConfirmed(rental, order)).toBe(true);
	expect(isPhoneRefundConfirmed({ ...rental, refundedAt: null }, order)).toBe(false);
	expect(isPhoneRefundConfirmed(rental, { ...order, refundedAmount: 499.5 })).toBe(false);
	expect(isPhoneRefundConfirmed(rental, { ...order, userId: null })).toBe(false);
	expect(isPhoneRefundConfirmed({ ...rental, saleAmountNgn: 0 }, order)).toBe(false);
});
