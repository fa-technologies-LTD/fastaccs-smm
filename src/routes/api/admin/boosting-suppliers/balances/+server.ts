import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	BOOST_BALANCE_PROVIDERS,
	type BoostBalanceProvider
} from '$lib/helpers/boosting-supplier-balances';
import { readBoostSupplierBalances } from '$lib/server/boosting-providers/balances';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage'))
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	const provider = url.searchParams.get('provider');
	if (provider !== null && !BOOST_BALANCE_PROVIDERS.some((item) => item.id === provider))
		return json({ success: false, error: 'Unknown supplier.' }, { status: 400 });
	return json({
		success: true,
		data: {
			providers: await readBoostSupplierBalances(
				(provider as BoostBalanceProvider | null) ?? undefined
			)
		}
	});
};
