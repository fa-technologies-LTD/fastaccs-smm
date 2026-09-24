import { json } from '@sveltejs/kit';
import {
	BOOSTING_ACTION_TYPES,
	BOOSTING_PLATFORMS,
	getBoostingActionTypesForPlatform
} from '$lib/helpers/boosting-service-config';
import type { BoostingActionType, BoostingPlatform } from '$lib/helpers/social-link-validator';
import { resolveBoostingLink } from '$lib/server/boosting-link-resolver';
import type { RequestHandler } from './$types';

const RESOLUTION_WINDOW_MS = 60_000;
const RESOLUTION_LIMIT_PER_WINDOW = 20;
const MAX_TRACKED_CLIENTS = 2_000;
const resolutionWindows = new Map<string, { startedAt: number; count: number }>();

function consumeResolutionAllowance(clientKey: string, now = Date.now()): boolean {
	const current = resolutionWindows.get(clientKey);
	if (!current || now - current.startedAt >= RESOLUTION_WINDOW_MS) {
		if (resolutionWindows.size >= MAX_TRACKED_CLIENTS) resolutionWindows.clear();
		resolutionWindows.set(clientKey, { startedAt: now, count: 1 });
		return true;
	}

	current.count += 1;
	return current.count <= RESOLUTION_LIMIT_PER_WINDOW;
}

function getClientKey(request: Request, getClientAddress: () => string): string {
	const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
	const realIp = request.headers.get('x-real-ip')?.trim();
	if (forwarded || realIp) return forwarded || realIp || 'unknown';
	try {
		return getClientAddress() || 'unknown';
	} catch {
		return 'unknown';
	}
}

export const POST: RequestHandler = async ({ request, setHeaders, getClientAddress }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	let body: Record<string, unknown>;
	try {
		const parsed = await request.json();
		body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
	} catch {
		return json({ success: false, error: 'Invalid request body.' }, { status: 400 });
	}
	const platform = String(body.platform || '') as BoostingPlatform;
	const actionType = String(body.actionType || '') as BoostingActionType;
	const url = String(body.url || '')
		.trim()
		.slice(0, 2_048);
	if (
		!BOOSTING_PLATFORMS.includes(platform) ||
		!BOOSTING_ACTION_TYPES.includes(actionType) ||
		!url
	) {
		return json({ success: false, error: 'Invalid Boosting link request.' }, { status: 400 });
	}
	if (!getBoostingActionTypesForPlatform(platform).includes(actionType)) {
		return json(
			{ success: false, error: 'That service is not available for this platform.' },
			{ status: 400 }
		);
	}

	if (!consumeResolutionAllowance(getClientKey(request, getClientAddress))) {
		return json(
			{ success: false, error: 'Too many link checks. Please try again shortly.' },
			{ status: 429, headers: { 'retry-after': '60' } }
		);
	}

	const data = await resolveBoostingLink(platform, actionType, url);
	return json({ success: true, data });
};
