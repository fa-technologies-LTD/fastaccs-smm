import { describe, expect, it } from 'vitest';
import { findSectionTab, sectionCount, visibleSections } from './admin-sections';

const owner = [
	'admin:access',
	'admin:revenue:view',
	'admin:orders:manage',
	'admin:inventory:manage',
	'admin:catalog:manage',
	'admin:users:manage',
	'admin:settings:manage',
	'admin:broadcast:manage',
	'admin:affiliates:manage',
	'admin:content:manage',
	'admin:promotions:manage'
];
const where = (path: string, tab: string | null = null, perms = owner) => {
	const found = findSectionTab(visibleSections(perms, { adminPromotions: true }), path, tab);
	return found ? `${found.section.label} › ${found.tab.label}` : null;
};

describe('admin sections', () => {
	it('has 9 sections for the owner, in menu order', () => {
		expect(visibleSections(owner, { adminPromotions: true }).map((s) => s.label)).toEqual([
			'Overview',
			'Orders',
			'Inventory',
			'Customers',
			'Products',
			'Pricing',
			'Analytics',
			'Growth',
			'Settings'
		]);
	});

	it('finds the right tab, including detail pages and pages that share a path', () => {
		expect(where('/admin')).toBe('Overview › Overview');
		expect(where('/admin/orders/abc')).toBe('Orders › Account Orders');
		expect(where('/admin/numbers/orders')).toBe('Orders › Numbers Orders');
		expect(where('/admin/numbers')).toBe('Pricing › Numbers Prices');
		expect(where('/admin/numbers/analytics')).toBe('Analytics › Numbers Sales');
		expect(where('/admin/analytics')).toBe('Analytics › Overview');
		expect(where('/admin/analytics', 'boosting')).toBe('Analytics › Boosting Sales');
		expect(where('/admin/boosting')).toBe('Products › Boosting');
		expect(where('/admin/boosting-pricing')).toBe('Products › Boosting');
		expect(where('/admin/boosting-mappings')).toBe('Products › Boosting');
		expect(where('/admin/boosting-preview')).toBe('Products › Boosting');
		expect(where('/admin/batches/xyz')).toBe('Inventory › Upload Logs');
	});

	it('keeps the combined Boosting workspace out of the price-only switcher', () => {
		expect(
			visibleSections(owner, { adminPromotions: true })
				.find((section) => section.id === 'pricing')
				?.tabs.map((tab) => tab.label)
		).toEqual(['Account Prices', 'Numbers Prices']);
	});

	it('ignores a page’s own ?tab= when the page is not shared', () => {
		expect(where('/admin/settings', 'payments')).toBe('Settings › Settings');
	});

	it('shows an assistant only Orders, Inventory and Customers (no payouts)', () => {
		const assistant = ['admin:access', 'admin:orders:manage', 'admin:inventory:manage'];
		const sections = visibleSections(assistant);
		expect(sections.map((s) => s.label)).toEqual(['Overview', 'Orders', 'Inventory', 'Customers']);
		expect(sections.find((s) => s.id === 'customers')?.tabs.map((t) => t.label)).toEqual([
			'Customers'
		]);
	});

	it('shows Payment Issues only when something needs it', () => {
		const tabs = (counts = {}) =>
			visibleSections(owner, {}, counts)
				.find((s) => s.id === 'orders')
				?.tabs.map((t) => t.label);
		expect(tabs()).not.toContain('Payment Issues');
		expect(tabs({ '/admin/payment-recovery': 2 })).toContain('Payment Issues');
	});

	it('adds up a section’s counts for its menu badge', () => {
		const orders = visibleSections(owner).find((s) => s.id === 'orders')!;
		expect(sectionCount(orders, { '/admin/orders': 2, '/admin/boosting-orders': 3 })).toBe(5);
	});
});
