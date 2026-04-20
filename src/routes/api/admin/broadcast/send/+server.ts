import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	createBroadcast,
	getBroadcastBatchConfig,
	parseBroadcastAudience,
	sanitizePlatformIds
} from '$lib/services/admin-broadcast';

interface BroadcastSendPayload {
	subject?: unknown;
	body?: unknown;
	audience?: unknown;
	platformIds?: unknown;
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	const payload = (await request.json().catch(() => ({}))) as BroadcastSendPayload;
	const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
	const body = typeof payload.body === 'string' ? payload.body.trim() : '';
	const audience = parseBroadcastAudience(payload.audience);
	const platformIds = sanitizePlatformIds(payload.platformIds);

	if (!subject) {
		return json({ success: false, error: 'Subject is required.' }, { status: 400 });
	}
	if (!body) {
		return json({ success: false, error: 'Message body is required.' }, { status: 400 });
	}
	if (!audience) {
		return json({ success: false, error: 'Audience is required.' }, { status: 400 });
	}
	if (audience === 'specific_platform_buyers' && platformIds.length === 0) {
		return json(
			{ success: false, error: 'Select at least one platform for this audience.' },
			{ status: 400 }
		);
	}

	const { broadcastId, total } = await createBroadcast({
		subject,
		body,
		audience,
		platformIds
	});

	if (total === 0) {
		return json(
			{ success: false, error: 'No recipients matched the selected audience.' },
			{ status: 400 }
		);
	}

	return json({
		success: true,
		data: {
			broadcastId,
			total,
			batchConfig: getBroadcastBatchConfig()
		}
	});
};
