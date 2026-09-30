import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	hasPermission: vi.fn(),
	load: vi.fn(),
	save: vi.fn()
}));

vi.mock('$lib/auth/admin-roles', () => ({ hasAdminPermission: mocks.hasPermission }));
vi.mock('$lib/server/boosting-providers/mapping-workspace', () => ({
	BoostMappingError: class BoostMappingError extends Error {
		status = 400;
		code = 'invalid_mapping';
	},
	isBoostFoundationMissing: () => false,
	loadBoostMappingWorkspace: mocks.load,
	saveBoostMappingWorkspace: mocks.save
}));

import { GET, PUT } from './+server';

const categoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function event(method: 'GET' | 'PUT', id = categoryId, body: unknown = {}) {
	return {
		locals: { user: { id: 'admin-1' }, adminContext: {} },
		params: { categoryId: id },
		url: new URL(`https://smm.fastaccs.com/api/admin/boosting-mappings/${id}`),
		request: new Request(`https://smm.fastaccs.com/api/admin/boosting-mappings/${id}`, {
			method,
			...(method === 'PUT'
				? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
				: {})
		}),
		setHeaders: vi.fn()
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasPermission.mockReturnValue(true);
	mocks.load.mockResolvedValue({ foundationReady: true });
	mocks.save.mockResolvedValue(undefined);
});

describe('boosting mapping endpoint', () => {
	it('requires catalogue permission before reading or saving mappings', async () => {
		mocks.hasPermission.mockReturnValue(false);
		expect((await GET(event('GET'))).status).toBe(403);
		expect((await PUT(event('PUT'))).status).toBe(403);
		expect(mocks.load).not.toHaveBeenCalled();
		expect(mocks.save).not.toHaveBeenCalled();
	});

	it('rejects malformed category identifiers before database access', async () => {
		const response = await GET(event('GET', 'not-a-category'));
		expect(response.status).toBe(400);
		expect(mocks.load).not.toHaveBeenCalled();
	});

	it('loads the private workspace with no-store caching', async () => {
		const input = event('GET');
		const response = await GET(input);
		expect(response.status).toBe(200);
		expect(mocks.load).toHaveBeenCalledWith(categoryId, {
			search: '',
			qualityTier: 'value'
		});
	});

	it('saves only the internal mapping and reloads its safe view', async () => {
		const body = { offer: { routingPolicy: 'automatic' }, routes: [] };
		const response = await PUT(event('PUT', categoryId, body));
		expect(response.status).toBe(200);
		expect(mocks.save).toHaveBeenCalledWith(categoryId, body, 'admin-1');
		expect(mocks.load).toHaveBeenCalledWith(categoryId, { qualityTier: 'value' });
	});
});
