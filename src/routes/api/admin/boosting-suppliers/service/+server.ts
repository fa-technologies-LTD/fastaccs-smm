import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	lookupBoostProviderService,
	recommendBoostProviderServices
} from '$lib/server/boosting-providers/setup-service';
import { BOOST_PROVIDER_IDS, type BoostProviderId } from '$lib/server/boosting-providers/types';
import type { RequestHandler } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const GET: RequestHandler = async ({ locals, url, setHeaders }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	}
	setHeaders({ 'cache-control': 'private, no-store' });
	const categoryId = String(url.searchParams.get('categoryId') || '');
	if (!UUID_RE.test(categoryId)) {
		return json({ success: false, error: 'Choose a customer result first.' }, { status: 400 });
	}
	if (url.searchParams.get('mode') === 'smart') {
		const qualityTier = String(url.searchParams.get('tier') || 'value');
		const data = await recommendBoostProviderServices({ categoryId, qualityTier });
		return json({ success: true, data });
	}
	const provider = String(url.searchParams.get('provider') || '') as BoostProviderId;
	if (!BOOST_PROVIDER_IDS.includes(provider)) {
		return json({ success: false, error: 'Choose SMM Raja or BulkFollows.' }, { status: 400 });
	}
	const data = await lookupBoostProviderService({
		categoryId,
		provider,
		serviceCode: String(url.searchParams.get('code') || '')
	});
	return json({ success: true, data });
};
