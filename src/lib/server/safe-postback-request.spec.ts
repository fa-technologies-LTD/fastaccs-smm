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
		['not-an-ip', false],
		// Codex re-review: other spellings of loopback / unspecified / mapped IPv4.
		['0:0:0:0:0:0:0:1', false],
		['0000:0000:0000:0000:0000:0000:0000:0001', false],
		['0:0:0:0:0:0:0:0', false],
		['::ffff:7f00:1', false],
		['::FFFF:7F00:0001', false],
		['::ffff:0:7f00:1', false],
		['::127.0.0.1', false],
		['::ffff:a9fe:a9fe', false], // 169.254.169.254 (metadata) in hex
		['::ffff:5db8:d822', true], // 93.184.216.34 in hex
		['64:ff9b::7f00:1', false],
		['64:ff9b::5db8:d822', true],
		['64:ff9b:1::1', false],
		['fe80::1%en0', false],
		['FE80::1', false],
		['fec0::1', false],
		['2001:db8::1', false],
		['2001::1', false],
		['2002:c0a8:101::1', false],
		['100::1', false],
		['2606:4700:0:0:0:0:6810:1', true]
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

	it('refuses hex-mapped and expanded IPv6 loopback answers', async () => {
		expect((await run([{ address: '::ffff:7f00:1', family: 6 }])).error?.code).toBe('EUNSAFEADDR');
		expect((await run([{ address: '0:0:0:0:0:0:0:1', family: 6 }])).error?.code).toBe(
			'EUNSAFEADDR'
		);
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
