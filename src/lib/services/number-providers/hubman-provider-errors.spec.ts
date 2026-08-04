import { describe, it, expect, vi } from 'vitest';

// Isolated from the main adapter spec: throwing spies + vitest's unhandled-rejection tracker
// interact badly when several tests share the file. Structured like the verified debug run.
const getSmsMock = vi.hoisted(() => vi.fn());
const { HubmanError } = vi.hoisted(() => {
	class HubmanError extends Error {
		status: number;
		body: unknown;
		constructor(message: string, status: number, body: unknown) {
			super(message);
			this.name = 'HubmanError';
			this.status = status;
			this.body = body;
		}
	}
	return { HubmanError };
});

vi.mock('../hubman', () => ({
	isHubmanConfigured: () => true,
	getBalanceCents: vi.fn(),
	rentActivationNumber: vi.fn(),
	getSms: getSmsMock,
	cancelRent: vi.fn(),
	HubmanError
}));

import { hubmanProvider } from './hubman-provider';

describe('hubmanProvider.pollSms error branches', () => {
	it('maps hub-man 422 (activation window closed) to expired', async () => {
		getSmsMock.mockImplementation(async () => {
			throw new HubmanError('inactive', 422, null);
		});
		let result: unknown;
		try {
			result = await hubmanProvider.pollSms('u');
		} catch (e) {
			result = { threw: String(e) };
		}
		expect(result).toEqual({ status: 'expired' });
	});

	it('maps a transient failure to error (never a false receive/refund)', async () => {
		getSmsMock.mockImplementation(async () => {
			throw new Error('network');
		});
		let result: { status?: string } = {};
		try {
			result = await hubmanProvider.pollSms('u');
		} catch (e) {
			result = { status: `threw:${String(e)}` };
		}
		expect(result.status).toBe('error');
	});
});
