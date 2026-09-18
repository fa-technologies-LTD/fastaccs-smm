import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('$lib/server/boosting-link-resolver', () => ({ resolveBoostingLink: mocks.resolve }));

import { POST } from './+server';

function event(
	body: unknown,
	clientAddress = '198.51.100.10',
	headers: Record<string, string> = {}
) {
	return {
		request: new Request('https://smm.fastaccs.com/api/boosting-links/resolve', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify(body)
		}),
		setHeaders: vi.fn(),
		getClientAddress: () => clientAddress
	} as never;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.resolve.mockResolvedValue({
		originalUrl: 'https://vm.tiktok.com/example',
		resolvedUrl: 'https://www.tiktok.com/@creator/video/123',
		wasResolved: true,
		validation: { valid: true }
	});
});

describe('public Boosting link resolver', () => {
	it('resolves a supported official platform link', async () => {
		const response = await POST(
			event(
				{ platform: 'tiktok', actionType: 'likes', url: 'https://vm.tiktok.com/example' },
				'198.51.100.11'
			)
		);

		expect(response.status).toBe(200);
		expect(mocks.resolve).toHaveBeenCalledWith('tiktok', 'likes', 'https://vm.tiktok.com/example');
	});

	it('rejects action types that do not belong to the selected platform', async () => {
		const response = await POST(
			event(
				{ platform: 'spotify', actionType: 'watch_time', url: 'https://open.spotify.com/track/1' },
				'198.51.100.12'
			)
		);

		expect(response.status).toBe(400);
		expect(mocks.resolve).not.toHaveBeenCalled();
	});

	it('limits repeated outbound checks from one client', async () => {
		const clientAddress = '198.51.100.13';
		for (let index = 0; index < 20; index += 1) {
			const response = await POST(
				event(
					{ platform: 'facebook', actionType: 'followers', url: 'https://facebook.com/user' },
					clientAddress
				)
			);
			expect(response.status).toBe(200);
		}

		const blocked = await POST(
			event(
				{ platform: 'facebook', actionType: 'followers', url: 'https://facebook.com/user' },
				clientAddress
			)
		);
		expect(blocked.status).toBe(429);
		expect(blocked.headers.get('retry-after')).toBe('60');
		expect(mocks.resolve).toHaveBeenCalledTimes(20);
	});
});
