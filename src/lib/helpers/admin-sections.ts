import type { AdminPermission } from '$lib/auth/admin-roles';

/**
 * The admin's 9 sections and the pages inside each. The sidebar shows the sections; the switcher
 * above each page shows that section's pages. Every switcher lists Accounts, then Boosting, then
 * Numbers. A tab shows only when the signed-in role can open the page behind it.
 */
export type AdminSectionId =
	| 'overview'
	| 'orders'
	| 'inventory'
	| 'customers'
	| 'products'
	| 'pricing'
	| 'analytics'
	| 'growth'
	| 'settings';

export interface AdminTab {
	href: string;
	label: string;
	permission?: AdminPermission;
	/** Match only this exact path (child paths belong to other tabs). */
	exact?: boolean;
	/** Other pages that belong to this tab (detail pages, previews). */
	also?: string[];
	/** Feature flag that must be on. */
	flag?: 'adminPromotions';
	/** Show only while something needs attention there (or while you are on it). */
	onlyWhenNeeded?: boolean;
}

export interface AdminSection {
	id: AdminSectionId;
	label: string;
	tabs: AdminTab[];
}

export const ADMIN_SECTIONS: AdminSection[] = [
	{ id: 'overview', label: 'Overview', tabs: [{ href: '/admin', label: 'Overview', exact: true }] },
	{
		id: 'orders',
		label: 'Orders',
		tabs: [
			{ href: '/admin/orders', label: 'Account Orders' },
			{ href: '/admin/boosting-orders', label: 'Boosting Orders' },
			{ href: '/admin/numbers/orders', label: 'Numbers Orders', permission: 'admin:orders:manage' },
			{
				href: '/admin/payment-recovery',
				label: 'Payment Issues',
				permission: 'admin:orders:manage',
				onlyWhenNeeded: true
			}
		]
	},
	{
		id: 'inventory',
		label: 'Inventory',
		tabs: [
			{ href: '/admin/inventory', label: 'Stock', permission: 'admin:inventory:manage' },
			{ href: '/admin/batches', label: 'Upload Logs', permission: 'admin:inventory:manage' }
		]
	},
	{
		id: 'customers',
		label: 'Customers',
		tabs: [
			{ href: '/admin/users', label: 'Customers' },
			{ href: '/admin/affiliates', label: 'Affiliates', permission: 'admin:affiliates:manage' },
			{ href: '/admin/wallets', label: 'Payouts', permission: 'admin:revenue:view' }
		]
	},
	{
		id: 'products',
		label: 'Products',
		tabs: [
			{ href: '/admin/tiers', label: 'Account Types', permission: 'admin:catalog:manage' },
			{
				href: '/admin/boosting-services',
				label: 'Boosting Services',
				permission: 'admin:catalog:manage',
				also: ['/admin/boosting-preview']
			}
		]
	},
	{
		id: 'pricing',
		label: 'Pricing',
		tabs: [
			{
				href: '/admin/account-prices',
				label: 'Account Prices',
				permission: 'admin:catalog:manage'
			},
			{
				href: '/admin/boosting-pricing',
				label: 'Boosting Prices',
				permission: 'admin:catalog:manage',
				also: ['/admin/boosting-mappings']
			},
			{
				href: '/admin/numbers',
				label: 'Numbers Prices',
				permission: 'admin:catalog:manage',
				exact: true
			}
		]
	},
	{
		id: 'analytics',
		label: 'Analytics',
		tabs: [
			{ href: '/admin/analytics', label: 'Overview', permission: 'admin:revenue:view' },
			{
				href: '/admin/analytics?tab=accounts',
				label: 'Account Sales',
				permission: 'admin:revenue:view'
			},
			{
				href: '/admin/analytics?tab=boosting',
				label: 'Boosting Sales',
				permission: 'admin:revenue:view'
			},
			{
				href: '/admin/numbers/analytics',
				label: 'Numbers Sales',
				permission: 'admin:catalog:manage'
			},
			{ href: '/admin/analytics?tab=users', label: 'Customers', permission: 'admin:revenue:view' },
			{ href: '/admin/marketing', label: 'Marketing', permission: 'admin:revenue:view' }
		]
	},
	{
		id: 'growth',
		label: 'Growth',
		tabs: [
			{
				href: '/admin/promotions',
				label: 'Promotions',
				permission: 'admin:promotions:manage',
				flag: 'adminPromotions'
			},
			{ href: '/admin/campaigns', label: 'Campaigns', permission: 'admin:revenue:view' },
			{ href: '/admin/broadcast', label: 'Emails', permission: 'admin:broadcast:manage' },
			{ href: '/admin/autopilot', label: 'Telegram Autopilot', permission: 'admin:revenue:view' },
			{ href: '/admin/microcopy', label: 'Site Text', permission: 'admin:content:manage' }
		]
	},
	{
		id: 'settings',
		label: 'Settings',
		tabs: [
			{ href: '/admin/settings', label: 'Settings', permission: 'admin:settings:manage' },
			{ href: '/admin/automation', label: 'System Health', permission: 'admin:settings:manage' }
		]
	}
];

type Flags = Partial<Record<'adminPromotions', boolean>>;
type Counts = Record<string, number>;

const pathOf = (href: string) => href.split('?')[0];
const tabParamOf = (href: string) => new URL(href, 'http://x').searchParams.get('tab');

/** Sections with the tabs this role can open; sections with nothing left are dropped. */
export function visibleSections(
	permissions: readonly string[],
	flags: Flags = {},
	counts: Counts = {},
	pathname = ''
): AdminSection[] {
	return ADMIN_SECTIONS.map((section) => ({
		...section,
		tabs: section.tabs.filter((tab) => {
			if (tab.permission && !permissions.includes(tab.permission)) return false;
			if (tab.flag && !flags[tab.flag]) return false;
			if (tab.onlyWhenNeeded && !(counts[tab.href] > 0) && !tabMatches(tab, pathname, null, false))
				return false;
			return true;
		})
	})).filter((section) => section.tabs.length > 0);
}

function tabMatches(
	tab: AdminTab,
	pathname: string,
	tabParam: string | null,
	sharesPage: boolean
): boolean {
	const paths = [pathOf(tab.href), ...(tab.also ?? [])];
	const onPage = paths.some(
		(candidate) => pathname === candidate || (!tab.exact && pathname.startsWith(`${candidate}/`))
	);
	if (!onPage) return false;
	// Only tabs that share one page are told apart by ?tab= (other pages use ?tab= for their own
	// inner tabs). The bare page is the first of them.
	return !sharesPage || (tabParamOf(tab.href) ?? null) === (tabParam || null);
}

function sharedPaths(section: AdminSection): Set<string> {
	const seen = new Map<string, number>();
	for (const tab of section.tabs) seen.set(pathOf(tab.href), (seen.get(pathOf(tab.href)) ?? 0) + 1);
	return new Set([...seen].filter(([, n]) => n > 1).map(([path]) => path));
}

/** The section and tab for a URL, using the most specific match. */
export function findSectionTab(
	sections: AdminSection[],
	pathname: string,
	tabParam: string | null
): { section: AdminSection; tab: AdminTab } | null {
	let best: { section: AdminSection; tab: AdminTab; score: number } | null = null;
	for (const section of sections) {
		const shared = sharedPaths(section);
		for (const tab of section.tabs) {
			if (!tabMatches(tab, pathname, tabParam, shared.has(pathOf(tab.href)))) continue;
			const score = pathOf(tab.href).length + (tabParamOf(tab.href) ? 1 : 0);
			if (!best || score > best.score) best = { section, tab, score };
		}
	}
	return best ? { section: best.section, tab: best.tab } : null;
}

/** Total of the "needs attention" counts across a section's tabs. */
export function sectionCount(section: AdminSection, counts: Counts): number {
	return section.tabs.reduce((sum, tab) => sum + (counts[tab.href] ?? 0), 0);
}
