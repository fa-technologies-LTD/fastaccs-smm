import { describe, expect, it } from 'vitest';
import { consumeRequestAllowance } from './request-rate-limit';

describe('anonymous request allowance', () => {
	it('limits one client within a window and resets after it expires', () => {
		const request = new Request('https://smm.fastaccs.com/example', {
			headers: { 'x-forwarded-for': '203.0.113.25' }
		});
		const namespace = `test-${crypto.randomUUID()}`;
		const options = { namespace, request, limit: 2, windowMs: 1_000 };

		expect(consumeRequestAllowance({ ...options, now: 10_000 })).toBe(true);
		expect(consumeRequestAllowance({ ...options, now: 10_100 })).toBe(true);
		expect(consumeRequestAllowance({ ...options, now: 10_200 })).toBe(false);
		expect(consumeRequestAllowance({ ...options, now: 11_000 })).toBe(true);
	});

	it('keeps separate clients independent', () => {
		const namespace = `test-${crypto.randomUUID()}`;
		const makeRequest = (address: string) =>
			new Request('https://smm.fastaccs.com/example', {
				headers: { 'x-forwarded-for': address }
			});

		expect(
			consumeRequestAllowance({
				namespace,
				request: makeRequest('203.0.113.1'),
				limit: 1,
				windowMs: 1_000,
				now: 20_000
			})
		).toBe(true);
		expect(
			consumeRequestAllowance({
				namespace,
				request: makeRequest('203.0.113.2'),
				limit: 1,
				windowMs: 1_000,
				now: 20_000
			})
		).toBe(true);
	});
});
