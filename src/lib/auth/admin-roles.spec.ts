import { describe, expect, it } from 'vitest';
import { getRequiredAdminPermission } from './admin-roles';

describe('order route permissions', () => {
	it('lets the customer boosting-link endpoint perform its own owner check', () => {
		expect(
			getRequiredAdminPermission('/api/orders/order-1/boosting-link/item-1', 'PATCH')
		).toBeNull();
	});

	it('keeps unrelated order mutations admin-gated', () => {
		expect(getRequiredAdminPermission('/api/orders/order-1/refund', 'POST')).toBe(
			'admin:orders:manage'
		);
	});
});
