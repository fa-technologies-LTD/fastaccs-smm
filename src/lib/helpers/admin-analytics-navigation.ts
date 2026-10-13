export const ANALYTICS_SECTIONS = [
	{ id: 'overview', label: 'Overview', href: '/admin/analytics' },
	{ id: 'accounts', label: 'Accounts', href: '/admin/analytics?tab=accounts' },
	{ id: 'boosting', label: 'Boosting', href: '/admin/boosting-orders' },
	{ id: 'numbers', label: 'Numbers', href: '/admin/numbers/analytics' },
	{ id: 'users', label: 'Users', href: '/admin/analytics?tab=users' }
] as const;

export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number]['id'];

export function visibleAnalyticsSections(permissions: readonly string[]) {
	return ANALYTICS_SECTIONS.filter((section) =>
		permissions.includes(
			section.id === 'boosting'
				? 'admin:access'
				: section.id === 'numbers'
					? 'admin:catalog:manage'
					: 'admin:revenue:view'
		)
	);
}

export function getAnalyticsSection(value: string | null | undefined): AnalyticsSection {
	return ANALYTICS_SECTIONS.find((section) => section.id === value)?.id ?? 'overview';
}

/** Only same-hub panels use shallow navigation; product reports load their real pages. */
export function isAnalyticsHubPanel(section: AnalyticsSection): boolean {
	return section === 'overview' || section === 'accounts' || section === 'users';
}
