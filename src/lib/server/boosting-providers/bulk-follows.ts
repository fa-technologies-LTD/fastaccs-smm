import { env } from '$env/dynamic/private';
import { createPanelReadClient } from './panel-client';

export const bulkFollowsClient = createPanelReadClient({
	id: 'bulk_follows',
	label: 'BulkFollows',
	baseUrl: 'https://bulkfollows.com/api/v2',
	getApiKey: () => env.BULKFOLLOWS_API_KEY
});
