import { expect, it } from 'vitest';
import {
	ANALYTICS_SECTIONS,
	getAnalyticsSection,
	isAnalyticsHubPanel,
	visibleAnalyticsSections
} from './admin-analytics-navigation';

it('has one destination per section and real Numbers/Boosting report links', () => {
	expect(ANALYTICS_SECTIONS.map((section) => section.label)).toEqual([
		'Overview',
		'Accounts',
		'Boosting',
		'Numbers',
		'Users'
	]);
	expect(new Set(ANALYTICS_SECTIONS.map((section) => section.href)).size).toBe(5);
	expect(ANALYTICS_SECTIONS.find((section) => section.id === 'numbers')?.href).toBe(
		'/admin/numbers/analytics'
	);
	expect(ANALYTICS_SECTIONS.find((section) => section.id === 'boosting')?.href).toBe(
		'/admin/boosting-orders'
	);
});

it.each([undefined, null, '', 'unknown', '__proto__', 'https://example.com'])(
	'defaults invalid sections to Overview: %s',
	(value) => {
		expect(getAnalyticsSection(value)).toBe('overview');
	}
);

it('does not substitute a shallow panel for product-specific report loading', () => {
	expect(
		ANALYTICS_SECTIONS.filter((section) => isAnalyticsHubPanel(section.id)).map(
			(section) => section.id
		)
	).toEqual(['overview', 'accounts', 'users']);
});

it('keeps navigation within existing role permissions and fails closed', () => {
	expect(visibleAnalyticsSections([])).toEqual([]);
	expect(visibleAnalyticsSections(['admin:access']).map((section) => section.id)).toEqual([
		'boosting'
	]);
	expect(
		visibleAnalyticsSections(['admin:access', 'admin:catalog:manage']).map((section) => section.id)
	).toEqual(['boosting', 'numbers']);
	expect(
		visibleAnalyticsSections(['admin:access', 'admin:catalog:manage', 'admin:revenue:view'])
	).toHaveLength(5);
});
