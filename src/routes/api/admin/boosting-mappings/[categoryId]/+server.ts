import { json } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	BoostMappingError,
	isBoostFoundationMissing,
	loadBoostMappingWorkspace,
	saveBoostMappingWorkspace
} from '$lib/server/boosting-providers/mapping-workspace';
import type { RequestHandler } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(error: unknown): Response {
	if (error instanceof BoostMappingError) {
		return json(
			{ success: false, error: error.message, code: error.code },
			{ status: error.status }
		);
	}
	if (isBoostFoundationMissing(error)) {
		return json(
			{
				success: false,
				error: 'Apply the Boosting foundation migration before saving supplier routes.',
				code: 'migration_required'
			},
			{ status: 409 }
		);
	}
	throw error;
}

export const GET: RequestHandler = async ({ locals, params, setHeaders, url }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	}
	if (!UUID_RE.test(params.categoryId)) {
		return json({ success: false, error: 'Invalid Boosting offer.' }, { status: 400 });
	}
	setHeaders({ 'cache-control': 'private, no-store' });
	try {
		const data = await loadBoostMappingWorkspace(params.categoryId, {
			search: url.searchParams.get('q') || '',
			qualityTier: url.searchParams.get('tier') || 'value'
		});
		return json({ success: true, data });
	} catch (error) {
		return errorResponse(error);
	}
};

export const PUT: RequestHandler = async ({ locals, params, request, setHeaders }) => {
	if (!locals.user || !hasAdminPermission(locals.adminContext, 'admin:catalog:manage')) {
		return json({ success: false, error: 'Forbidden' }, { status: 403 });
	}
	if (!UUID_RE.test(params.categoryId)) {
		return json({ success: false, error: 'Invalid Boosting offer.' }, { status: 400 });
	}
	setHeaders({ 'cache-control': 'private, no-store' });
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ success: false, error: 'Invalid request body.' }, { status: 400 });
	}
	try {
		await saveBoostMappingWorkspace(params.categoryId, body, locals.user.id);
		const offer =
			body && typeof body === 'object' && 'offer' in body && body.offer && typeof body.offer === 'object'
				? (body.offer as Record<string, unknown>)
				: {};
		const data = await loadBoostMappingWorkspace(params.categoryId, {
			qualityTier: String(offer.qualityTier || 'value')
		});
		return json({ success: true, data });
	} catch (error) {
		return errorResponse(error);
	}
};
