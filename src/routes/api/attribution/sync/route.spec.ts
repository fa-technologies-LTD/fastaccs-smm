import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ CRON_SECRET: 'cron-secret' }) as Record<string, string>);
vi.mock('$env/dynamic/private', () => ({ env }));
const limiter = vi.hoisted(() => ({ allow: true }));
vi.mock('$lib/server/request-rate-limit', () => ({ consumeRequestAllowance: () => limiter.allow }));

import { POST } from './+server';
import { readServerAttribution } from '$lib/server/attribution-cookies';

function jar(initial: Record<string, string> = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		get: (name: string) => values.get(name),
		set: (name: string, value: string) => void values.set(name, value),
		delete: (name: string) => void values.delete(name)
	};
}

const origin = 'https://smm.fastaccs.com';
const adLanding =
	'/platforms/x?utm_source=propellerads&utm_medium=push&utm_campaign=183788&utm_content=5551&fa_click=abc123';

async function post(body: unknown, cookies = jar()) {
	const response = (await (POST as CallableFunction)({
		request: new Request(`${origin}/api/attribution/sync`, {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		cookies,
		url: new URL(`${origin}/api/attribution/sync`),
		getClientAddress: () => '127.0.0.1'
	})) as Response;
	return { status: response.status, body: await response.json(), cookies };
}

beforeEach(() => {
	limiter.allow = true;
});

describe('POST /api/attribution/sync', () => {
	it('sets consented attribution the server will honour', async () => {
		const { status, body, cookies } = await post({ consent: 'marketing', landing: adLanding });
		expect(status).toBe(200);
		expect(body).toMatchObject({ ok: true, level: 'marketing', first: true, last: true });
		const attribution = readServerAttribution(cookies, new Date());
		expect(attribution.last).toMatchObject({ source: 'propellerads', clickId: 'abc123' });
	});

	it('a later downgrade removes the ad click even without a landing', async () => {
		const cookies = jar();
		await post({ consent: 'marketing', landing: adLanding }, cookies);
		const { body } = await post({ consent: 'analytics' }, cookies);
		expect(body).toMatchObject({ level: 'analytics', last: false });
		expect(cookies.values.has('fa_lt')).toBe(false);
	});

	it('clears everything when no choice is recorded', async () => {
		const cookies = jar();
		await post({ consent: 'marketing', landing: adLanding }, cookies);
		await post({ consent: null }, cookies);
		expect(cookies.values.size).toBe(0);
	});

	it.each([
		['JSON null', 'null'],
		['an array', '[]'],
		['not JSON', 'nope'],
		['an unknown level', { consent: 'everything' }],
		['a missing level', { landing: '/' }],
		[
			'an absolute landing',
			{ consent: 'marketing', landing: 'https://evil.example/?utm_source=x' }
		],
		['a protocol-relative landing', { consent: 'marketing', landing: '//evil.example/' }],
		['an oversized landing', { consent: 'marketing', landing: `/${'a'.repeat(600)}` }]
	])('rejects %s without touching cookies', async (_name, body) => {
		const { status, cookies } = await post(body);
		expect(status).toBe(400);
		expect(cookies.values.size).toBe(0);
	});

	it('is rate limited', async () => {
		limiter.allow = false;
		const { status, cookies } = await post({ consent: 'marketing', landing: adLanding });
		expect(status).toBe(429);
		expect(cookies.values.size).toBe(0);
	});
});
