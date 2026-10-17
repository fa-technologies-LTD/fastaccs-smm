import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { prisma } from '$lib/prisma';
import { loadBoostControls } from '$lib/server/boosting-providers/pricing-controls';
import { loadBoostSupplierChoices } from '$lib/server/boosting-providers/supplier-choice';

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage'))
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	const provider = url.searchParams.get('provider') ?? 'all';
	const search = url.searchParams.get('search')?.trim() ?? '';
	if (!['all', 'smm_raja', 'bulk_follows'].includes(provider) || search.length > 120)
		return json(
			{ success: false, error: 'Choose a provider and use a shorter search.' },
			{ status: 400 }
		);
	try {
		const offerId = url.searchParams.get('offerId');
		if (offerId && !/^[a-f0-9-]{36}$/i.test(offerId))
			return json({ success: false, error: 'Choose a saved offer.' }, { status: 400 });
		// The common path needs just the offer and matching catalogue rows, not a full
		// pricing-sheet reload for every search keystroke. Both paths remain read-only.
		const saved = offerId
			? await prisma.boostCustomerOffer.findFirst({
					where: { id: offerId, category: { categoryType: 'boosting_service' } },
					include: { routes: true }
				})
			: null;
		const view = offerId ? null : await loadBoostControls();
		const row = saved ?? view?.sheet.rows.find((row) => row.id === url.searchParams.get('row'));
		if (!row || (!saved && !view?.setup[row.id]?.categoryId))
			return json(
				{ success: false, error: 'This customer result has not been configured yet.' },
				{ status: 400 }
			);
		const data = await loadBoostSupplierChoices(row, { provider, search }, prisma);
		const sourceOfferId = saved?.id ?? view?.sheet.rows.find((r) => r.id === row.id)?.sourceOfferId;
		const offer =
			saved ??
			(sourceOfferId
				? await prisma.boostCustomerOffer.findUnique({
						where: { id: sourceOfferId },
						include: { routes: true }
					})
				: null);
		for (const service of data.services) {
			const route = offer?.routes.find((r) => r.providerServiceId === service.providerServiceId);
			if (offer?.requiredVerifiedSignals.some((signal) => !route?.verifiedSignals.includes(signal)))
				service.publicationIssues!.push('A customer-facing service claim has not been verified.');
			if (
				offer?.refillDays != null &&
				(!service.refillAdvertised || (route?.verifiedRefillDays ?? 0) < offer.refillDays)
			)
				service.publicationIssues!.push(
					'The advertised refill cover is not verified for this supplier.'
				);
			if (
				offer &&
				offer.audienceTag !== 'general' &&
				!route?.audienceTags.includes(offer.audienceTag)
			)
				service.publicationIssues!.push('The advertised audience does not match the supplier.');
		}
		return json({ success: true, data });
	} catch {
		return json(
			{ success: false, error: 'Supplier choices could not load. Your draft is kept. Try again.' },
			{ status: 503 }
		);
	}
};
