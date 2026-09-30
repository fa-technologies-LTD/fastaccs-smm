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

describe('boosting automation route permissions', () => {
	it.each([
		['GET', '/admin/boosting-mappings'],
		['GET', '/api/admin/boosting-suppliers/discovery'],
		['POST', '/api/admin/boosting-suppliers/sync'],
		['GET', '/api/admin/boosting-mappings/category-1'],
		['PUT', '/api/admin/boosting-mappings/category-1']
	])('uses catalogue permission for %s %s', (method, pathname) => {
		expect(getRequiredAdminPermission(pathname, method)).toBe('admin:catalog:manage');
	});
});
