import { describe, expect, it, vi } from 'vitest';
import { BoostProviderSubmissionError, createPanelOrderClient } from './panel-order-client';

function response(payload: unknown, status = 200): Response {
	return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function input() {
	return {
		serviceId: '42',
		targetUrl: 'https://www.tiktok.com/@fastaccs/video/123456789',
		quantity: 1_000
	};
}

describe('boosting panel order contract client', () => {
	it.each([
		['Pending', 'pending'],
		['In progress', 'in_progress'],
		['Processing', 'in_progress'],
		['Completed', 'completed'],
		['Rejected', 'rejected'],
		['Cancelled', 'rejected'],
		['New status', 'unknown']
	])('reads the separate BulkFollows refill status %s', async (status, state) => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ status }));
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});
		await expect(client.getRefillStatus!('321')).resolves.toEqual({ state });
		expect(Object.fromEntries(fetchImpl.mock.calls[0][1]?.body as URLSearchParams)).toEqual({
			key: 'fixture-secret',
			action: 'refill_status',
			refill: '321'
		});
	});
	it.each([
		{ error: 'Refill not found' },
		{ status: { error: 'not found' } },
		{},
		[],
		'<html>maintenance</html>'
	])('does not invent refill completion from malformed/error payload %j', async (payload) => {
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response(payload))
		});
		await expect(client.getRefillStatus!('321')).rejects.toBeDefined();
	});
	it('does not expose the unverified refill-status action for SMM Raja', () => {
		expect(
			createPanelOrderClient({
				id: 'smm_raja',
				getApiKey: () => 'fixture-secret',
				fetchImpl: vi.fn<typeof fetch>()
			}).getRefillStatus
		).toBeUndefined();
	});
	it('does not mistake an order-shaped response for an accepted refill', async () => {
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response({ order: 23501 }))
		});
		await expect(client.requestRefill!('23501')).rejects.toMatchObject({
			code: 'invalid_response'
		});
	});
	it.each(['smm_raja', 'bulk_follows'] as const)(
		'sends newline comments without an independent quantity to %s',
		async (id) => {
			const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ order: 23501 }));
			const client = createPanelOrderClient({ id, getApiKey: () => 'fixture-secret', fetchImpl });
			await client.submitOrder({
				...input(),
				quantity: 2,
				inputMode: 'custom_comments',
				comments: 'Lovely!\r\nGreat work!'
			});
			const body = fetchImpl.mock.calls[0][1]?.body as URLSearchParams;
			expect(body.get('comments')).toBe('Lovely!\nGreat work!');
			expect(body.has('quantity')).toBe(false);
		}
	);
	it('rejects a conflicting comment count before contacting a supplier', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});
		await expect(
			client.submitOrder({
				...input(),
				quantity: 2,
				inputMode: 'custom_comments',
				comments: 'One comment'
			})
		).rejects.toMatchObject({ certainty: 'not_submitted', code: 'invalid_input' });
		expect(fetchImpl).not.toHaveBeenCalled();
	});
	it('preserves SMM Raja catalogue service prefixes while order IDs remain numeric', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ order: 23501 }));
		const client = createPanelOrderClient({
			id: 'smm_raja',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});
		await client.submitOrder({ ...input(), serviceId: 's4138' });
		expect((fetchImpl.mock.calls[0][1]?.body as URLSearchParams).get('service')).toBe('s4138');
		await expect(client.getStatuses(['s4138'])).rejects.toMatchObject({ code: 'invalid_input' });
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it('does not allow SMM Raja service prefixes at BulkFollows', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});
		await expect(client.submitOrder({ ...input(), serviceId: 's4138' })).rejects.toMatchObject({
			code: 'invalid_input'
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('encodes a standard order and accepts only a scalar positive order ID', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ order: 23501 }));
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});

		await expect(client.submitOrder(input())).resolves.toEqual({
			provider: 'bulk_follows',
			providerOrderId: '23501'
		});
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://bulkfollows.com/api/v2');
		expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
			action: 'add',
			service: '42',
			link: 'https://www.tiktok.com/@fastaccs/video/123456789',
			quantity: '1000',
			key: 'fixture-secret'
		});
	});

	it('classifies explicit provider rejection as definitely not submitted and redacts the key', async () => {
		const secret = 'do-not-leak';
		const client = createPanelOrderClient({
			id: 'smm_raja',
			getApiKey: () => secret,
			fetchImpl: vi
				.fn<typeof fetch>()
				.mockResolvedValue(response({ error: `Invalid API key ${secret}` }))
		});

		const error = await client.submitOrder(input()).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(BoostProviderSubmissionError);
		expect(error).toMatchObject({ code: 'provider_rejected', certainty: 'not_submitted' });
		expect(String(error)).toContain('[redacted]');
		expect(String(error)).not.toContain(secret);
	});

	it.each([
		['timeout', new DOMException('aborted', 'AbortError')],
		['network loss', new Error('socket closed')]
	])('holds a %s after dispatch as an unknown submission', async (_name, failure) => {
		const client = createPanelOrderClient({
			id: 'smm_raja',
			getApiKey: () => 'fixture-secret',
			fetchImpl: vi.fn<typeof fetch>().mockRejectedValue(failure)
		});

		await expect(client.submitOrder(input())).rejects.toMatchObject({
			code: 'submission_unknown',
			certainty: 'submission_unknown'
		});
	});

	it.each([
		['malformed JSON', '<html>maintenance</html>', 200],
		['unexpected success shape', { success: true }, 200],
		['HTTP failure', { error: 'gateway error' }, 503]
	])('holds %s after dispatch as an unknown submission', async (_name, payload, status) => {
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response(payload, status))
		});

		await expect(client.submitOrder(input())).rejects.toMatchObject({
			code: 'submission_unknown',
			certainty: 'submission_unknown'
		});
	});

	it('rejects invalid inputs before touching the provider', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});

		await expect(
			client.submitOrder({ ...input(), targetUrl: 'http://www.tiktok.com/@fastaccs' })
		).rejects.toMatchObject({ code: 'invalid_input', certainty: 'not_submitted' });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('uses BulkFollows documented batch field and normalizes status results in request order', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
			response({
				'10': {
					charge: '0.27819',
					start_count: '3572',
					status: 'In progress',
					remains: '157',
					currency: 'USD'
				},
				'11': { error: 'Incorrect order ID' }
			})
		);
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});

		const statuses = await client.getStatuses(['10', '11']);
		expect(statuses[0]).toMatchObject({
			providerOrderId: '10',
			state: 'in_progress',
			charge: 0.27819,
			startCount: 3572,
			remains: 157,
			error: null
		});
		expect(statuses[1]).toMatchObject({
			providerOrderId: '11',
			state: 'unknown',
			error: 'Incorrect order ID'
		});
		const body = fetchImpl.mock.calls[0][1]?.body as URLSearchParams;
		expect(body.get('orders')).toBe('10,11');
		expect(body.has('order')).toBe(false);
	});

	it('uses SMM Raja documented comma-separated order field', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
			response({
				'10': {
					charge: '1.10',
					start_count: '0',
					status: 'Pending',
					remains: '1000',
					currency: 'USD'
				},
				'11': {
					charge: '2.20',
					start_count: '0',
					status: 'Completed',
					remains: '0',
					currency: 'USD'
				}
			})
		);
		const client = createPanelOrderClient({
			id: 'smm_raja',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});

		await expect(client.getStatuses(['10', '11'])).resolves.toHaveLength(2);
		const body = fetchImpl.mock.calls[0][1]?.body as URLSearchParams;
		expect(body.get('order')).toBe('10,11');
		expect(body.has('orders')).toBe(false);
	});

	it('accepts the observed BulkFollows blank starting count without fabricating progress', async () => {
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
				response({
					status: 'Pending',
					charge: '0.000588',
					currency: 'USD',
					start_count: '',
					remains: '10'
				})
			)
		});
		await expect(client.getStatuses(['170675496'])).resolves.toEqual([
			expect.objectContaining({ state: 'pending', startCount: null, remains: 10, charge: 0.000588 })
		]);
	});

	it.each([undefined, null, '-1', 'unknown'])(
		'still rejects malformed starting counts (%s)',
		async (startCount) => {
			const client = createPanelOrderClient({
				id: 'bulk_follows',
				getApiKey: () => 'fixture-secret',
				fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
					response({
						status: 'Pending',
						charge: '0.000588',
						currency: 'USD',
						start_count: startCount,
						remains: '10'
					})
				)
			});
			await expect(client.getStatuses(['170675496'])).rejects.toMatchObject({
				code: 'invalid_response'
			});
		}
	);

	it('requires complete status records and caps batch checks at 100 IDs', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(response({ status: 'Completed', remains: '0', currency: 'USD' }));
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});

		await expect(client.getStatuses(['10'])).rejects.toMatchObject({ code: 'invalid_response' });
		await expect(
			client.getStatuses(Array.from({ length: 101 }, (_, index) => String(index + 1)))
		).rejects.toMatchObject({ code: 'invalid_input' });
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('requests a supplier refill using the standard panel contract', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response({ refill: '88' }));
		const client = createPanelOrderClient({
			id: 'bulk_follows',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});

		await expect(client.requestRefill?.('101')).resolves.toEqual({
			provider: 'bulk_follows',
			refillId: '88'
		});
		const body = fetchImpl.mock.calls[0][1]?.body as URLSearchParams;
		expect(body.get('action')).toBe('refill');
		expect(body.get('order')).toBe('101');
	});
});
