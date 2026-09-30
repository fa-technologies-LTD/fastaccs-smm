import { describe, expect, it } from 'vitest';
import {
	estimateBoostingSupplierCostNgn,
	maximumBoostingSupplierSpend,
	roundBoostingPrice,
	suggestBoostingCustomerPrice
} from './boosting-pricing';

describe('Boosting pricing', () => {
	it('converts supplier USD pricing for the exact customer quantity', () => {
		expect(
			estimateBoostingSupplierCostNgn({
				ratePerThousandUsd: 5,
				quantity: 500,
				usdNgnRate: 1700,
				currencyBufferPercent: 0
			})
		).toBe(4250);
	});

	it('adds the requested profit percentage to cost and rounds to ₦50', () => {
		expect(suggestBoostingCustomerPrice({ supplierCostNgn: 4250, targetMarginPercent: 40 })).toBe(
			5950
		);
		expect(roundBoostingPrice(1725)).toBe(1750);
	});

	it('derives the supplier ceiling from sale price and profit on cost', () => {
		expect(maximumBoostingSupplierSpend(5950, 40)).toBe(4250);
	});
});
