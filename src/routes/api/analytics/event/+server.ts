import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/prisma';
import { ANALYTICS_EVENT_TYPES } from '$lib/services/analytics-events';
import { consumeRequestAllowance } from '$lib/server/request-rate-limit';

const MAX_PATH_LENGTH = 300;
const ANALYTICS_WINDOW_MS = 60_000;
const ANALYTICS_EVENTS_PER_WINDOW = 60;

export const POST: RequestHandler = async ({ request, getClientAddress, locals }) => {
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

	// Visit source from consented attribution (last ad click, else first touch). Raw SQL because
	// the columns ship with the marketing migration; before it, fall back to the plain insert.
	const attribution = locals.attribution;
	const source = attribution?.last?.source || attribution?.first?.source || null;
	if (source) {
		const campaign = attribution?.last?.campaign || attribution?.first?.campaign || null;
		const content = attribution?.last?.content || null;
		try {
			await prisma.$executeRaw`
				INSERT INTO analytics_events (type, path, source, campaign, content)
				VALUES (${type}, ${path}, ${source}, ${campaign}, ${content})`;
			return json({ success: true });
		} catch {
			/* columns not migrated yet: record the visit without its source */
		}
	}

	await prisma.analyticsEvent.create({ data: { type, path } }).catch((error) => {
		console.error('Failed to record analytics event:', error);
	});

	return json({ success: true });
};
