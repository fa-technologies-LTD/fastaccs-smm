import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { ANALYTICS_EVENT_TYPES } from '$lib/services/analytics-events';
import { consumeRequestAllowance } from '$lib/server/request-rate-limit';

const MAX_PATH_LENGTH = 300;
const ANALYTICS_WINDOW_MS = 60_000;
const ANALYTICS_EVENTS_PER_WINDOW = 60;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (
		!consumeRequestAllowance({
			namespace: 'analytics-event',
			request,
			getClientAddress,
			limit: ANALYTICS_EVENTS_PER_WINDOW,
			windowMs: ANALYTICS_WINDOW_MS
		})
	) {
		return json({ success: false }, { status: 429, headers: { 'retry-after': '60' } });
	}

	const payload = await request.json().catch(() => null);
	const type = String(payload?.type || '');
	const path = String(payload?.path || '');

	const isValidType = (ANALYTICS_EVENT_TYPES as readonly string[]).includes(type);
	const isValidPath = path.startsWith('/') && path.length <= MAX_PATH_LENGTH;

	if (!isValidType || !isValidPath) {
		return json({ success: false }, { status: 400 });
	}

	await prisma.analyticsEvent.create({ data: { type, path } }).catch((error) => {
		console.error('Failed to record analytics event:', error);
	});

	return json({ success: true });
};
