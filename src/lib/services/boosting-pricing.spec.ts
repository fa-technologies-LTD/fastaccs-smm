import { describe, expect, it } from 'vitest';
import {
	estimateBoostingSupplierCostNgn,
	maximumBoostingSupplierSpend,
	roundBoostingPrice,
	suggestBoostingCustomerPrice
} from './boosting-pricing';

describe('Boosting pricing', () => {
	it('converts supplier USD pricing with the configured currency buffer', () => {
		expect(
			estimateBoostingSupplierCostNgn({
				ratePerThousandUsd: 5,
				quantity: 500,
				usdNgnRate: 1700,
				currencyBufferPercent: 5
			})
		).toBe(4462.5);
	});

	it('derives a rounded selling price from the target margin', () => {
		expect(suggestBoostingCustomerPrice({ supplierCostNgn: 4462.5, targetMarginPercent: 40 })).toBe(
			7450
		);
		expect(roundBoostingPrice(1725)).toBe(1750);
	});

	it('derives the hard supplier ceiling from sale price and minimum margin', () => {
		expect(maximumBoostingSupplierSpend(7450, 40)).toBe(4470);
	});
});
