import { describe, expect, it } from 'vitest';
import { buildCheckoutFingerprint, type CheckoutFingerprintInput } from './checkout-session';

const base: CheckoutFingerprintInput = {
	userId: 'buyer-1',
	items: [{ id: 'line-1', tierId: 'tier-1', quantity: 1, exactAccountId: null }],
	affiliateCode: null,
	promotionCode: null,
	total: 5800,
	useStoreCredit: false,
	storeCreditApplied: 0,
	payableTotal: 5800
};

describe('buildCheckoutFingerprint', () => {
	it('is stable for an unchanged cart and payment intent', () => {
		expect(buildCheckoutFingerprint(base)).toBe(buildCheckoutFingerprint({ ...base }));
	});

	it('rotates when the buyer switches the same cart to full store credit', () => {
		const gateway = buildCheckoutFingerprint(base);
		const storeCredit = buildCheckoutFingerprint({
			...base,
			useStoreCredit: true,
			storeCreditApplied: 5800,
			payableTotal: 0
		});

		expect(storeCredit).not.toBe(gateway);
	});

	it('rotates when the applied credit amount changes', () => {
		const partial = buildCheckoutFingerprint({
			...base,
			useStoreCredit: true,
			storeCreditApplied: 1200,
			payableTotal: 4600
		});
		const increased = buildCheckoutFingerprint({
			...base,
			useStoreCredit: true,
			storeCreditApplied: 2000,
			payableTotal: 3800
		});

		expect(increased).not.toBe(partial);
	});
});
