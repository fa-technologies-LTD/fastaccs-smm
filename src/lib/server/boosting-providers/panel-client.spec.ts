import { describe, expect, it, vi } from 'vitest';
import { BULK_FOLLOWS_BALANCE_FIXTURE, BULK_FOLLOWS_SERVICE_FIXTURE } from './fixtures';
import { BoostProviderError, createPanelReadClient } from './panel-client';

function response(payload: unknown, status = 200): Response {
	return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('read-only boosting panel client', () => {
	it('sends only read actions and normalizes their responses', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValueOnce(response([BULK_FOLLOWS_SERVICE_FIXTURE]))
			.mockResolvedValueOnce(response(BULK_FOLLOWS_BALANCE_FIXTURE));
		const client = createPanelReadClient({
			id: 'bulk_follows',
			label: 'BulkFollows',
			baseUrl: 'https://bulkfollows.com/api/v2',
			getApiKey: () => 'fixture-secret',
			fetchImpl
		});

		const services = await client.listServices();
		const balance = await client.getBalance();

		expect(services).toHaveLength(1);
		expect(balance).toEqual({ provider: 'bulk_follows', amount: 21.006908, currency: 'USD' });
		expect(client).not.toHaveProperty('submitOrder');
		const actions = fetchImpl.mock.calls.map(([, init]) =>
			String((init?.body as URLSearchParams).get('action'))
		);
		expect(actions).toEqual(['services', 'balance']);
	});

	it('fails closed when the key is missing', async () => {
		const client = createPanelReadClient({
			id: 'smm_raja',
			label: 'SMM Raja',
			baseUrl: 'https://www.smmraja.com/api/v2',
			getApiKey: () => '',
			fetchImpl: vi.fn<typeof fetch>()
		});
		await expect(client.listServices()).rejects.toMatchObject({ code: 'not_configured' });
	});

	it('rejects provider errors and non-JSON success responses without exposing the key', async () => {
		const secret = 'do-not-leak-this';
		const errorClient = createPanelReadClient({
			id: 'smm_raja',
			label: 'SMM Raja',
			baseUrl: 'https://www.smmraja.com/api/v2',
			getApiKey: () => secret,
			fetchImpl: vi
				.fn<typeof fetch>()
				.mockResolvedValue(response({ error: `Invalid API key: ${secret}` }))
		});
		const htmlClient = createPanelReadClient({
			id: 'smm_raja',
			label: 'SMM Raja',
			baseUrl: 'https://www.smmraja.com/api/v2',
			getApiKey: () => secret,
			fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response('<html>maintenance</html>'))
		});

		const providerError = await errorClient.listServices().catch((error: unknown) => error);
		const htmlError = await htmlClient.listServices().catch((error: unknown) => error);
		expect(providerError).toBeInstanceOf(BoostProviderError);
		expect(providerError).toMatchObject({ code: 'provider_error' });
		expect(String(providerError)).toContain('[redacted]');
		expect(htmlError).toMatchObject({ code: 'invalid_json' });
		expect(String(providerError)).not.toContain(secret);
		expect(String(htmlError)).not.toContain(secret);
	});

	it('normalizes aborts as timeouts', async () => {
		const client = createPanelReadClient({
			id: 'bulk_follows',
			label: 'BulkFollows',
			baseUrl: 'https://bulkfollows.com/api/v2',
			getApiKey: () => 'fixture-secret',
			fetchImpl: vi
				.fn<typeof fetch>()
				.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'))
		});
		await expect(client.getBalance()).rejects.toMatchObject({ code: 'timeout' });
	});
});
