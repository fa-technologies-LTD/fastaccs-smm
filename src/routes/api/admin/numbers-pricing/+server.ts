import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { exportNumbersPricingCsv } from '$lib/helpers/numbers-pricing-sheet';
import {
	NumbersPricingError,
	loadNumbersPricingView,
	saveNumbersPricingDraft,
	publishNumbersPricingSheet
} from '$lib/server/numbers-pricing-sheet';

const allowed = (locals: App.Locals) =>
	Boolean(locals.user && hasAdminPermission(locals.adminContext, 'admin:catalog:manage'));
export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	if (!allowed(locals)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
	setHeaders({ 'cache-control': 'private, no-store' });
	const view = await loadNumbersPricingView();
	if (url.searchParams.get('export') === 'csv')
		return new Response(exportNumbersPricingCsv(view), {
			headers: {
				'content-type': 'text/csv; charset=utf-8',
				'content-disposition': 'attachment; filename="fastaccs-numbers-pricing.csv"',
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
	if (text.length > 2000000)
		return json({ success: false, error: 'Sheet is too large.' }, { status: 413 });
	try {
		const body = JSON.parse(text);
		if (!body || typeof body !== 'object' || Array.isArray(body))
			throw new NumbersPricingError('Invalid request.');
		if (body.action === 'save') await saveNumbersPricingDraft(body.sheet, locals.user!.id);
		else if (body.action === 'publish') {
			if (body.confirm !== true || !Number.isInteger(body.version))
				throw new NumbersPricingError('Confirm publication of the saved draft.');
			await publishNumbersPricingSheet(body.version, locals.user!.id);
		} else throw new NumbersPricingError('Unknown action.');
		return json({ success: true, data: await loadNumbersPricingView() });
	} catch (cause) {
		if (cause instanceof NumbersPricingError)
			return json({ success: false, error: cause.message }, { status: cause.status });
		if (cause instanceof SyntaxError)
			return json({ success: false, error: 'Invalid request.' }, { status: 400 });
		console.error('[Numbers Pricing] Request failed', cause);
		return json(
			{
				success: false,
				error: 'Could not complete the request. Reload to check the saved version.'
			},
			{ status: 500 }
		);
	}
};
