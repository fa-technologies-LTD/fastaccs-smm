import { describe, expect, it } from 'vitest';
import { computeExpectedGatewayAmount, isGatewayAmountSufficient } from './payment-settlement';

/**
 * The money rule at the heart of settlement: the gateway only owes (order total − store
 * credit already applied). A valid store-credit + card split must settle; a genuine
 * underpayment must not. This is the regression guard for the "Payment Failed on partial
 * store credit" bug — never let it come back.
 */
describe('gateway amount rule', () => {
	describe('computeExpectedGatewayAmount', () => {
		it('is the total minus store credit', () => {
			expect(computeExpectedGatewayAmount(4800, 3800)).toBe(1000);
		});
		it('is the full total when no store credit is applied', () => {
			expect(computeExpectedGatewayAmount(4800, 0)).toBe(4800);
		});
		it('never goes negative when store credit covers (or over-covers) the total', () => {
			expect(computeExpectedGatewayAmount(4800, 4800)).toBe(0);
			expect(computeExpectedGatewayAmount(4800, 5000)).toBe(0);
		});
		it('treats a missing store-credit value as zero', () => {
			expect(computeExpectedGatewayAmount(1000, NaN)).toBe(1000);
		});
	});

	describe('isGatewayAmountSufficient', () => {
		it('accepts a store-credit + card split that covers the remainder (the hotfix case)', () => {
			// ₦4,800 order, ₦3,800 store credit, ₦1,000 on the card → the gateway owed ₦1,000.
			expect(isGatewayAmountSufficient(4800, 3800, 1000)).toBe(true);
		});
		it('accepts full store credit with no card charge', () => {
			expect(isGatewayAmountSufficient(4800, 4800, 0)).toBe(true);
			expect(isGatewayAmountSufficient(4800, 5000, 0)).toBe(true);
		});
		it('accepts an exact full card payment', () => {
			expect(isGatewayAmountSufficient(4800, 0, 4800)).toBe(true);
		});
		it('rejects a genuine underpayment with no store credit', () => {
			expect(isGatewayAmountSufficient(4800, 0, 1000)).toBe(false);
		});
		it('rejects an underpayment even when some store credit was applied', () => {
			// Owed ₦1,000 on the card but only ₦500 verified → still short.
			expect(isGatewayAmountSufficient(4800, 3800, 500)).toBe(false);
		});
		it('tolerates a sub-kobo rounding shortfall', () => {
			expect(isGatewayAmountSufficient(1000, 0, 999.99)).toBe(true);
		});
		it('rejects a non-finite paid amount', () => {
			expect(isGatewayAmountSufficient(1000, 0, Number.NaN)).toBe(false);
		});
	});
});
