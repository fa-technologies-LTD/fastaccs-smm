import { describe, expect, it } from 'vitest';
import { describeAdminActivity } from './admin-activity-label';

const id = '82c1237c-7836-46b4-bfff-6ab501087a15';

describe('describeAdminActivity', () => {
	it.each([
		[
			'POST /api/admin/boosting-suppliers/sync',
			'Boosting suppliers refreshed',
			'/admin/boosting-services'
		],
		[`POST /api/orders/${id}/refund`, 'Order refunded to store credit', `/admin/orders/${id}`],
		[`POST /api/orders/${id}/refund-account`, 'Faulty account refunded', `/admin/orders/${id}`],
		[`POST /api/orders/${id}/replace-account`, 'Faulty account replaced', `/admin/orders/${id}`],
		['POST /api/batches/import', 'Logs uploaded', '/admin/batches'],
		[`DELETE /api/categories/${id}/offload`, 'Unsold logs deleted', '/admin/inventory'],
		[`PUT /api/categories/${id}`, 'Account type or platform edited', '/admin/tiers'],
		['POST /api/admin/automation/winback/run', 'Ran by hand: Winback', '/admin/automation']
	])('turns %s into plain words', (description, label, href) => {
		expect(describeAdminActivity(description)).toEqual({ label, href });
	});

	it('never shows a raw path for a route it does not know', () => {
		const { label } = describeAdminActivity(`PATCH /api/admin/some-new-thing/${id}`);
		expect(label).toBe('Some new thing updated');
		expect(label).not.toContain('/');
	});

	it('keeps descriptions that are already sentences', () => {
		expect(describeAdminActivity('Refunded ₦2,500 to store credit for order ORD-1')).toEqual({
			label: 'Refunded ₦2,500 to store credit for order ORD-1',
			href: null
		});
		expect(describeAdminActivity(null).label).toBe('Admin action');
	});
});
