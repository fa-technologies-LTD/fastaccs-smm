import { describe, expect, it } from 'vitest';
import { sanitizeCustomerOrder } from './customer-order-visibility';

describe('customer order DTO', () => {
	it('exposes only the reporting owner, never tracking IDs or refund dispatch metadata', () => {
		const result = sanitizeCustomerOrder({
			id: 'order',
			status: 'paid',
			paymentStatus: 'paid',
			analyticsMetadata: {
				ga4EcommerceVersion: 2,
				ga4ConsentGranted: true,
				ga4ClientId: '123.456',
				ga4RefundDispatch: { token: 'private-token' },
				attribution: { clickId: 'private-click' }
			},
			orderItems: []
		});
		expect(result.ga4PurchaseReporter).toBe('server');
		expect(JSON.stringify(result)).not.toMatch(/123\.456|private-|analyticsMetadata|clickId/);
		expect(sanitizeCustomerOrder({ orderItems: [] }).ga4PurchaseReporter).toBe('browser');
	});
	it('removes affiliate, cost, supplier and provider internals recursively', () => {
		const result = sanitizeCustomerOrder({
			id: 'order-1',
			orderNumber: 'ORD-1',
			status: 'paid',
			paymentStatus: 'paid',
			totalAmount: 8_200,
			affiliateCode: 'PRIVATE',
			affiliateUserId: 'affiliate-1',
			analyticsMetadata: {
				affiliatePolicy: { commissionPercent: 5 },
				productCostSnapshot: { costPrice: 7_500 }
			},
			orderItems: [
				{
					id: 'item-1',
					quantity: 1,
					unitPrice: 8_200,
					totalPrice: 8_200,
					productName: 'Old IG',
					categoryId: 'tier-1',
					boostProviderReference: 'supplier-order-1',
					boostComplaints: [
						{
							id: 'complaint-1',
							type: 'dropped',
							status: 'open',
							supplierCaseId: 'private-supplier-case'
						}
					],
					accounts: [
						{
							id: 'account-1',
							batchId: 'private-batch',
							status: 'allocated',
							username: 'delivered-user'
						}
					],
					category: {
						id: 'tier-1',
						name: 'Old IG',
						slug: 'old-ig',
						categoryType: 'tier',
						metadata: {
							delivery_mode: 'instant_auto',
							pricing: { base_price: 8_200, cost_price: 7_500 },
							supplier: 'private'
						}
					}
				}
			]
		});

		expect(result).toEqual(
			expect.objectContaining({
				id: 'order-1',
				totalAmount: 8_200,
				orderItems: [
					expect.objectContaining({
						productName: 'Old IG',
						boostComplaints: [{ id: 'complaint-1', type: 'dropped', status: 'open' }],
						accounts: [expect.objectContaining({ username: 'delivered-user' })],
						category: expect.objectContaining({
							metadata: {
								delivery_mode: 'instant_auto',
								pricing: { base_price: 8_200 }
							}
						})
					})
				]
			})
		);
		expect(JSON.stringify(result)).not.toMatch(
			/affiliatePolicy|productCostSnapshot|cost_price|commissionPercent|supplier|boostProviderReference|affiliateCode|private-batch|private-supplier-case/
		);
	});
});
