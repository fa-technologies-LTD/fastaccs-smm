import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { prisma } from '$lib/prisma';
import { clearBoostProviderDiscoveryCache } from '$lib/server/boosting-providers/discovery';
import { syncBoostProviderCatalogues } from '$lib/server/boosting-providers/catalog-sync';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, setHeaders }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	}

	setHeaders({ 'cache-control': 'private, no-store' });
	const results = await syncBoostProviderCatalogues();
	clearBoostProviderDiscoveryCache();
	const synced = results.filter((result) => result.status === 'synced').length;

	await prisma.adminAuditLog.create({
		data: {
			actorUserId: locals.user.id,
			action: 'boosting_supplier_catalogue_synced',
			resourceType: 'boosting_supplier_catalogue',
			description: `${synced} of ${results.length} supplier catalogues synced`,
			metadata: {
				mode: 'read_only_supplier_api',
				results: results.map((result) => ({
					provider: result.provider,
					status: result.status,
					servicesSeen: result.servicesSeen,
					servicesMarkedUnavailable: result.servicesMarkedUnavailable,
					balanceWarning: result.balanceWarning,
					error: result.error
				}))
			},
			ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
			userAgent: request.headers.get('user-agent')?.slice(0, 500) || null
		}
	});

	return json({
		success: synced > 0,
		data: { synced, total: results.length, results },
		error: synced > 0 ? null : 'No supplier catalogue could be synced.'
	});
};
