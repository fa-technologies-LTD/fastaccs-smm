import { describe, expect, it } from 'vitest';
import { createSafeLookup, isPublicAddress, sendPostbackRequest } from './safe-postback-request';

describe('isPublicAddress', () => {
	it.each([
		['93.184.216.34', true],
		['104.18.1.1', true],
		['2606:4700::6810:1', true],
		['127.0.0.1', false],
		['10.1.2.3', false],
		['172.16.0.1', false],
		['172.31.255.255', false],
		['192.168.1.1', false],
		['169.254.169.254', false],
		['100.64.0.1', false],
		['0.0.0.0', false],
		['224.0.0.1', false],
		['::1', false],
		['::', false],
		['fd00::1', false],
		['fe80::1', false],
		['::ffff:127.0.0.1', false],
		['::ffff:93.184.216.34', true],
		['not-an-ip', false]
	])('%s → %s', (ip, expected) => {
		expect(isPublicAddress(ip)).toBe(expected);
	});
});

describe('createSafeLookup', () => {
	const run = (addresses: Array<{ address: string; family: number }>, options = {}) =>
		new Promise<{ error: NodeJS.ErrnoException | null; address: unknown }>((resolve) =>
			createSafeLookup((_host, _opts, callback) => callback(null, addresses))(
				'ad.propellerads.com',
				options,
				(error, address) => resolve({ error, address })
			)
		);

	it('passes public answers through', async () => {
		expect(await run([{ address: '93.184.216.34', family: 4 }])).toEqual({
			error: null,
			address: '93.184.216.34'
		});
	});

	it('refuses an answer that includes any private address (DNS rebinding)', async () => {
		const result = await run([
			{ address: '93.184.216.34', family: 4 },
			{ address: '127.0.0.1', family: 4 }
		]);
		expect(result.error?.code).toBe('EUNSAFEADDR');
	});

	it('supports the all:true form used by connection racing', async () => {
		expect((await run([{ address: '93.184.216.34', family: 4 }], { all: true })).address).toEqual([
			{ address: '93.184.216.34', family: 4 }
		]);
	});
});

describe('sendPostbackRequest', () => {
	it('never connects to loopback, even when asked directly', async () => {
		const result = await sendPostbackRequest('https://localhost:1/');
		expect('error' in result && (result.error as { code?: string }).code).toBe('EUNSAFEADDR');
	});
});
