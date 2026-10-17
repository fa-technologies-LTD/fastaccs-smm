import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { loadBoostSupplierDetails } from '$lib/server/boosting-providers/supplier-details';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage'))
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	const offerId = url.searchParams.get('offerId') ?? '';
	if (!UUID.test(offerId))
		return json({ success: false, error: 'Choose a configured offer.' }, { status: 400 });
	try {
		const data = await loadBoostSupplierDetails(offerId);
		if (!data) return json({ success: false, error: 'Saved offer not found.' }, { status: 404 });
		return json({ success: true, data });
	} catch {
		return json(
			{ success: false, error: 'Supplier details could not load. Your pricing edits are kept.' },
			{ status: 503 }
		);
	}
};
