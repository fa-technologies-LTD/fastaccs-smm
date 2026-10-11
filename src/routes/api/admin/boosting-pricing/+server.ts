import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { BoostPricingError } from '$lib/server/boosting-providers/pricing-sheet';
import {
	loadBoostControls,
	saveBoostControls
} from '$lib/server/boosting-providers/pricing-controls';
import { prepopulateBoostingDraftSuggestions } from '$lib/server/boosting-providers/draft-suggestions';
import { syncBoostProviderCatalogues } from '$lib/server/boosting-providers/catalog-sync';
import { exportPricingCsv } from '$lib/helpers/boosting-pricing-sheet';

export const config = { maxDuration: 300 };

const allowed = (locals: App.Locals) =>
	Boolean(locals.user && hasAdminPermission(locals.adminContext, 'admin:catalog:manage'));
export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	if (!allowed(locals)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
	setHeaders({ 'cache-control': 'private, no-store' });
	const view = await loadBoostControls();
	if (url.searchParams.get('export') === 'csv')
		return new Response(exportPricingCsv(view.sheet, view.quotes), {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': 'attachment; filename="fastaccs-boosting-pricing.csv"',
				'cache-control': 'private, no-store'
			}
		});
	return json({ success: true, data: view });
};
export const POST: RequestHandler = async ({ locals, request, url, setHeaders }) => {
	if (!allowed(locals)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
	if (request.headers.get('origin') !== url.origin)
		return json({ success: false, error: 'Invalid origin' }, { status: 403 });
	setHeaders({ 'cache-control': 'private, no-store' });
	const text = await request.text();
	if (text.length > 600000)
		return json({ success: false, error: 'Sheet is too large.' }, { status: 413 });
	try {
		const body = JSON.parse(text);
		if (!body || typeof body !== 'object' || Array.isArray(body))
			throw new BoostPricingError('Invalid request.');
		if (body.action === 'save') await saveBoostControls(body.sheet, locals.user!.id);
		else if (body.action === 'expand') {
			const results = await syncBoostProviderCatalogues();
			if (!results.some((r) => r.status === 'synced'))
				throw new BoostPricingError('Suppliers could not refresh. Nothing added.');
			const current = await loadBoostControls();
			const summary = await prepopulateBoostingDraftSuggestions({
				appendOnly: true,
				usdNgnRate: current.sheet.settings.fx
			});
			return json({ success: true, summary, data: await loadBoostControls() });
		} else throw new BoostPricingError('Unknown action.');
		return json({ success: true, data: await loadBoostControls() });
	} catch (cause) {
		if (cause instanceof BoostPricingError)
			return json({ success: false, error: cause.message }, { status: cause.status });
		if (cause instanceof SyntaxError)
			return json({ success: false, error: 'Invalid request.' }, { status: 400 });
		console.error('[Boosting Pricing] Request failed', cause);
		return json(
			{
				success: false,
				error: 'Could not complete the request. Reload to check the saved version.'
			},
			{ status: 500 }
		);
	}
};
