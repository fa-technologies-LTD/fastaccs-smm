import {
	Activity,
	BarChart3,
	Layers,
	Mail,
	Package,
	Plus,
	Settings,
	ShoppingCart,
	Tag,
	Target,
	Type,
	UserCheck,
	Users,
	Wallet
} from '$lib/icons';
import type { AdminPermission } from '$lib/auth/admin-roles';

export interface AdminDashboardSection {
	href: string;
	label: string;
	description: string;
	icon: typeof Activity;
	permission?: AdminPermission;
	/** Name of a boolean key in the admin feature-flag snapshot that must be true for this section to show. */
	featureFlag?: 'adminPromotions';
}

export const ADMIN_DASHBOARD_SECTIONS: AdminDashboardSection[] = [
	{
		href: '/admin/orders',
		label: 'Order Management',
		description: 'Process and track orders',
		icon: ShoppingCart
	},
	{
		href: '/admin/inventory',
		label: 'Inventory Dashboard',
		description: 'Monitor stock levels',
		icon: Package,
		permission: 'admin:inventory:manage'
	},
	{
		href: '/admin/platforms',
		label: 'Platform Management',
		description: 'Manage platforms & tiers',
		icon: Layers,
		permission: 'admin:catalog:manage'
	},
	{
		href: '/admin/tiers',
		label: 'Tier Management',
		description: 'Configure account types & pricing',
		icon: Target,
		permission: 'admin:catalog:manage'
	},
	{
		href: '/admin/batches',
		label: 'Batch Operations',
		description: 'Bulk import accounts',
		icon: Plus,
		permission: 'admin:inventory:manage'
	},
	{
		href: '/admin/users',
		label: 'User Management',
		description: 'View and manage customer accounts',
		icon: Users
	},
	{
		href: '/admin/affiliates',
		label: 'Affiliate Program',
		description: 'Manage affiliates & payouts',
		icon: UserCheck,
		permission: 'admin:affiliates:manage'
	},
	{
		href: '/admin/wallets',
		label: 'Wallets',
		description: 'Affiliate wallet balances & transactions',
		icon: Wallet
	},
	{
		href: '/admin/analytics',
		label: 'Analytics',
		description: 'Revenue, sales & stock trends',
		icon: BarChart3
	},
	{
		href: '/admin/promotions',
		label: 'Promotions',
		description: 'Manage promo codes',
		icon: Tag,
		permission: 'admin:promotions:manage',
		featureFlag: 'adminPromotions'
	},
	{
		href: '/admin/microcopy',
		label: 'Microcopy',
		description: 'Edit site copy & messaging',
		icon: Type,
		permission: 'admin:content:manage'
	},
	{
		href: '/admin/broadcast',
		label: 'Broadcast',
		description: 'Send campaigns & view email activity',
		icon: Mail,
		permission: 'admin:broadcast:manage'
	},
	{
		href: '/admin/automation',
		label: 'Automation',
		description: 'Monitor scheduled jobs',
		icon: Activity
	},
	{
		href: '/admin/settings',
		label: 'Settings',
		description: 'Configure store & notification settings',
		icon: Settings,
		permission: 'admin:settings:manage'
	}
];
