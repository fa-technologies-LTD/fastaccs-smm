import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({
	env: { GA4_MEASUREMENT_PROTOCOL_API_SECRET: 'synthetic-test-secret' }
}));
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_GA4_MEASUREMENT_ID: 'G-TEST123' } }));
import { sendGa4MeasurementProtocolEvents } from './ga4-measurement-protocol';

describe('GA4 validation and safe transport reporting', () => {
	const fetchMock = vi.fn();
	const input = {
		clientId: '123.456',
		events: [
			{ name: 'purchase', params: { transaction_id: 'synthetic', currency: 'NGN', value: 500 } }
		],
		debug: true
	};
	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubGlobal('fetch', fetchMock);
	});
	afterEach(() => vi.unstubAllGlobals());
	it('requests strict debug validation and succeeds only on an empty validation list', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ validationMessages: [] })));
		expect(await sendGa4MeasurementProtocolEvents(input)).toEqual({
			success: true,
			error: undefined,
			validationMessages: []
		});
		const [url, options] = fetchMock.mock.calls[0];
		expect(url.pathname).toBe('/debug/mp/collect');
		expect(JSON.parse(options.body).validation_behavior).toBe('ENFORCE_RECOMMENDATIONS');
	});
	it('does not mistake HTTP 200 with validation errors for a valid event', async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ validationMessages: [{ validationCode: 'VALUE_INVALID' }] }))
		);
		expect(await sendGa4MeasurementProtocolEvents(input)).toMatchObject({
			success: false,
			error: 'GA4 event failed validation.'
		});
	});
	it.each(['not-json', '{}', '{"validationMessages":"invalid"}'])(
		'fails closed on a malformed validation body %s',
		async (body) => {
			fetchMock.mockResolvedValue(new Response(body));
			expect(await sendGa4MeasurementProtocolEvents(input)).toMatchObject({
				success: false,
				error: 'GA4 debug endpoint returned an invalid validation response.'
			});
		}
	);
	it('retains transport-success behavior for non-debug production requests', async () => {
		fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
		expect(await sendGa4MeasurementProtocolEvents({ ...input, debug: false })).toEqual({
			success: true
		});
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('validation_behavior');
	});
	it('never exposes an API-secret URL through a fetch error', async () => {
		fetchMock.mockRejectedValue(new Error('Network error: ?api_secret=synthetic-test-secret'));
		const result = await sendGa4MeasurementProtocolEvents(input);
		expect(result.success).toBe(false);
		expect(JSON.stringify(result)).not.toContain('synthetic-test-secret');
	});
});
