import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { loadBoostPricingView } from '$lib/server/boosting-providers/pricing-sheet';
import { lookupBoostProviderService } from '$lib/server/boosting-providers/setup-service';
import { prisma } from '$lib/prisma';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage'))
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	setHeaders({ 'cache-control': 'private, no-store' });
	const provider = url.searchParams.get('provider');
	const code = url.searchParams.get('code')?.trim() ?? '';
	if (!['smm_raja', 'bulk_follows'].includes(provider ?? '') || code.length > 80)
		return json({ success: false, error: 'Invalid supplier code.' }, { status: 400 });
	const view = await loadBoostPricingView();
	const row = view.sheet.rows.find((r) => r.id === url.searchParams.get('row'));
	const offer = row?.sourceOfferId
		? await prisma.boostCustomerOffer.findUnique({ where: { id: row.sourceOfferId } })
		: null;
	if (!row || !offer)
		return json(
			{ success: false, error: 'Set up this result in Advanced setup first.' },
			{ status: 400 }
		);
	const result = await lookupBoostProviderService({
		categoryId: offer.categoryId,
		provider: provider as 'smm_raja' | 'bulk_follows',
		serviceCode: code,
		qualityTier: row.tier
	});
	const s = result.service;
	return json({
		success: true,
		data: s
			? {
					providerServiceId: s.id,
					name: s.name,
					rateUsd: s.ratePerThousand,
					min: s.minQuantity,
					max: s.maxQuantity,
					checkedAt: s.lastSeenAt,
					issues: result.compatible ? [] : result.issues
				}
			: null
	});
};
