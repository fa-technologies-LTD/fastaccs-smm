import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getBroadcastAudienceCount,
	parseBroadcastAudience,
	sanitizePlatformIds
} from '$lib/services/admin-broadcast';

function parsePlatformIdsFromQuery(url: URL): string[] {
	const raw = url.searchParams.get('platformIds');
	if (!raw) return [];
	const splitValues = raw
		.split(',')
		.map((value) => value.trim())
		.filter(Boolean);
	return sanitizePlatformIds(splitValues);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user || locals.user.userType !== 'ADMIN') {
		return json({ success: false, error: 'Unauthorized' }, { status: 403 });
	}

	const audience = parseBroadcastAudience(url.searchParams.get('audience'));
	if (!audience) {
		return json({ success: false, error: 'Invalid audience.' }, { status: 400 });
	}

	const platformIds = parsePlatformIdsFromQuery(url);
	const count = await getBroadcastAudienceCount(audience, platformIds);

	return json({
		success: true,
		data: {
			count
		}
	});
};
