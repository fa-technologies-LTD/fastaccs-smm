import type { AdminRole, User } from '@prisma/client';
import { prisma } from '$lib/prisma';

export type AdminPermission =
	| 'admin:access'
	| 'admin:revenue:view'
	| 'admin:orders:manage'
	| 'admin:inventory:manage'
	| 'admin:catalog:manage'
	| 'admin:users:manage'
	| 'admin:settings:manage'
	| 'admin:broadcast:manage'
	| 'admin:affiliates:manage'
	| 'admin:content:manage'
	| 'admin:promotions:manage';

export interface AdminContext {
	userId: string;
	role: AdminRole;
	permissions: AdminPermission[];
	canViewRevenue: boolean;
}

const ROLE_PERMISSION_MAP: Record<AdminRole, AdminPermission[]> = {
	FULL_ADMIN: [
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
	],
	ORDER_MANAGER: [
		'admin:access',
		'admin:orders:manage',
		'admin:inventory:manage',
		'admin:catalog:manage'
	],
	READ_ONLY: ['admin:access']
};

export function hasAdminPermission(
	adminContext: Pick<AdminContext, 'permissions'> | null | undefined,
	permission: AdminPermission
): boolean {
	if (!adminContext) return false;
	return adminContext.permissions.includes(permission);
}

export async function getAdminRole(userId: string): Promise<AdminRole> {
	const assignment = await prisma.adminRoleAssignment.findUnique({
		where: { userId },
		select: { role: true }
	});

	return assignment?.role || 'FULL_ADMIN';
}

export async function ensureAdminRoleAssignment(userId: string): Promise<AdminRole> {
	const assignment = await prisma.adminRoleAssignment.upsert({
		where: { userId },
		update: {},
		create: {
			userId,
			role: 'FULL_ADMIN'
		},
		select: { role: true }
	});

	return assignment.role;
}

export async function getAdminContext(user: User | null | undefined): Promise<AdminContext | null> {
	if (!user || user.userType !== 'ADMIN') {
		return null;
	}

	const role = await getAdminRole(user.id);
	const permissions = ROLE_PERMISSION_MAP[role];

	return {
		userId: user.id,
		role,
		permissions,
		canViewRevenue: permissions.includes('admin:revenue:view')
	};
}

interface AdminRouteRule {
	prefix: string;
	readPermission: AdminPermission;
	writePermission: AdminPermission;
}

const ADMIN_ROUTE_RULES: AdminRouteRule[] = [
	{
		prefix: '/admin/settings',
		readPermission: 'admin:settings:manage',
		writePermission: 'admin:settings:manage'
	},
	{
		prefix: '/admin/orders',
		readPermission: 'admin:access',
		writePermission: 'admin:orders:manage'
	},
	{
		prefix: '/admin/inventory',
		readPermission: 'admin:access',
		writePermission: 'admin:inventory:manage'
	},
	{
		prefix: '/admin/platforms',
		readPermission: 'admin:access',
		writePermission: 'admin:catalog:manage'
	},
	{
		prefix: '/admin/tiers',
		readPermission: 'admin:access',
		writePermission: 'admin:catalog:manage'
	},
	{
		prefix: '/admin/batches',
		readPermission: 'admin:access',
		writePermission: 'admin:inventory:manage'
	},
	{ prefix: '/admin/users', readPermission: 'admin:access', writePermission: 'admin:users:manage' },
	{
		prefix: '/admin/analytics',
		readPermission: 'admin:access',
		writePermission: 'admin:revenue:view'
	},
	{
		prefix: '/admin/wallets',
		readPermission: 'admin:revenue:view',
		writePermission: 'admin:revenue:view'
	},
	{
		prefix: '/admin/affiliates',
		readPermission: 'admin:affiliates:manage',
		writePermission: 'admin:affiliates:manage'
	},
	{
		prefix: '/admin/broadcast',
		readPermission: 'admin:access',
		writePermission: 'admin:broadcast:manage'
	},
	{
		prefix: '/admin/microcopy',
		readPermission: 'admin:access',
		writePermission: 'admin:content:manage'
	},
	{
		prefix: '/admin/promotions',
		readPermission: 'admin:access',
		writePermission: 'admin:promotions:manage'
	},
	{
		prefix: '/api/admin/users',
		readPermission: 'admin:access',
		writePermission: 'admin:users:manage'
	},
	{
		prefix: '/api/admin/roles',
		readPermission: 'admin:access',
		writePermission: 'admin:users:manage'
	},
	{
		prefix: '/api/admin/affiliates',
		readPermission: 'admin:affiliates:manage',
		writePermission: 'admin:affiliates:manage'
	},
	{
		prefix: '/api/admin/broadcast',
		readPermission: 'admin:access',
		writePermission: 'admin:broadcast:manage'
	},
	{
		prefix: '/api/admin/microcopy',
		readPermission: 'admin:access',
		writePermission: 'admin:content:manage'
	},
	{
		prefix: '/api/admin/uploads',
		readPermission: 'admin:access',
		writePermission: 'admin:catalog:manage'
	},
	{
		prefix: '/api/admin/cleanup',
		readPermission: 'admin:access',
		writePermission: 'admin:inventory:manage'
	},
	{
		prefix: '/api/admin/promotions',
		readPermission: 'admin:access',
		writePermission: 'admin:promotions:manage'
	},
	{
		prefix: '/api/orders/stats',
		readPermission: 'admin:access',
		writePermission: 'admin:orders:manage'
	},
	{
		prefix: '/api/inventory',
		readPermission: 'admin:access',
		writePermission: 'admin:inventory:manage'
	},
	{
		prefix: '/api/accounts',
		readPermission: 'admin:access',
		writePermission: 'admin:inventory:manage'
	},
	{
		prefix: '/api/batches',
		readPermission: 'admin:access',
		writePermission: 'admin:inventory:manage'
	},
	{
		prefix: '/api/payments/reconcile',
		readPermission: 'admin:access',
		writePermission: 'admin:orders:manage'
	},
	{
		prefix: '/api/send-email',
		readPermission: 'admin:broadcast:manage',
		writePermission: 'admin:broadcast:manage'
	}
];

function isWriteMethod(method: string): boolean {
	return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

export function getRequiredAdminPermission(
	pathname: string,
	method: string
): AdminPermission | null {
	const normalizedMethod = method.toUpperCase();

	// Public storefront cart lookup endpoint.
	if (pathname === '/api/categories/tiers/batch') {
		return null;
	}

	if (pathname.startsWith('/api/categories')) {
		return isWriteMethod(normalizedMethod) ? 'admin:catalog:manage' : null;
	}

	if (pathname === '/api/orders') {
		return null;
	}

	if (pathname.startsWith('/api/orders/')) {
		if (pathname.startsWith('/api/orders/stats')) {
			return 'admin:access';
		}
		return isWriteMethod(normalizedMethod) ? 'admin:orders:manage' : null;
	}

	const matched = ADMIN_ROUTE_RULES.find((rule) => pathname.startsWith(rule.prefix));
	if (matched) {
		return isWriteMethod(normalizedMethod) ? matched.writePermission : matched.readPermission;
	}

	if (pathname.startsWith('/admin')) {
		return 'admin:access';
	}

	if (pathname.startsWith('/api/admin')) {
		return isWriteMethod(normalizedMethod) ? 'admin:settings:manage' : 'admin:access';
	}

	return null;
}
