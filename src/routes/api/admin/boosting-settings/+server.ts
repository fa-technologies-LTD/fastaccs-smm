import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	getBoostingPricingConfig,
	saveBoostingPricingConfig
} from '$lib/services/boosting-pricing';
import type { RequestHandler } from './$types';

function allowed(locals: App.Locals): boolean {
	return Boolean(locals.user && hasAdminPermission(locals.adminContext, 'admin:catalog:manage'));
}

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	if (!allowed(locals)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
	setHeaders({ 'cache-control': 'private, no-store' });
	return json({ success: true, data: await getBoostingPricingConfig() });
};

export const PUT: RequestHandler = async ({ locals, request, setHeaders }) => {
	if (!allowed(locals)) return json({ success: false, error: 'Forbidden' }, { status: 403 });
	setHeaders({ 'cache-control': 'private, no-store' });
	let input: unknown;
	try {
		input = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid request body.' }, { status: 400 });
	}
	const value = input && typeof input === 'object' ? input : {};
	return json({
		success: true,
		data: await saveBoostingPricingConfig(value as Record<string, number>)
	});
};
