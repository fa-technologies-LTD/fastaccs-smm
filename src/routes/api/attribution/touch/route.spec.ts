import { describe, expect, it } from 'vitest';
import { DELETE, POST } from './+server';

function cookieJar(initial: Record<string, string> = {}) {
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

async function post(body: unknown, cookies = cookieJar()) {
	const response = await (POST as CallableFunction)({
		request: new Request(`${origin}/api/attribution/touch`, {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body)
		}),
		cookies,
		url: new URL(`${origin}/api/attribution/touch`)
	});
	return { response: response as Response, cookies };
}

describe('POST /api/attribution/touch', () => {
	it('sets first-touch and the ad click with marketing consent', async () => {
		const { response, cookies } = await post({
			consent: 'marketing',
			landing: adLanding,
			referrer: ''
		});

		expect(await response.json()).toEqual({ ok: true, first: true, last: true });
		expect(JSON.parse(cookies.values.get('fa_attr')!)).toMatchObject({ source: 'propellerads' });
		expect(JSON.parse(cookies.values.get('fa_lt')!)).toMatchObject({
			source: 'propellerads',
			campaign: '183788',
			content: '5551',
			clickId: 'abc123'
		});
	});

	it('analytics consent sets first-touch only, never the ad click', async () => {
		const { cookies } = await post({ consent: 'analytics', landing: adLanding, referrer: '' });
		expect(cookies.values.has('fa_attr')).toBe(true);
		expect(cookies.values.has('fa_lt')).toBe(false);
	});

	it('sets nothing for "necessary"', async () => {
		const { response, cookies } = await post({ consent: 'necessary', landing: adLanding });
		expect(await response.json()).toEqual({ ok: true, first: false, last: false });
		expect(cookies.values.size).toBe(0);
	});

	it('keeps an existing first touch (first-touch never changes)', async () => {
		const existing = JSON.stringify({
			source: 'google',
			medium: 'referral',
			campaign: '',
			referrer: '',
			landing: '/'
		});
		const { cookies } = await post(
			{ consent: 'marketing', landing: adLanding },
			cookieJar({ fa_attr: existing })
		);
		expect(cookies.values.get('fa_attr')).toBe(existing);
		expect(cookies.values.has('fa_lt')).toBe(true);
	});

	it.each([
		['not json', 'x'],
		['unknown consent', { consent: 'everything', landing: '/' }],
		['absolute landing', { consent: 'marketing', landing: 'https://evil.example/?utm_source=x' }],
		['protocol-relative landing', { consent: 'marketing', landing: '//evil.example/' }],
		['oversized landing', { consent: 'marketing', landing: `/${'a'.repeat(600)}` }]
	])('rejects %s', async (_name, body) => {
		const { response, cookies } = await post(body);
		expect(response.status).toBe(400);
		expect(cookies.values.size).toBe(0);
	});
});

describe('DELETE /api/attribution/touch', () => {
	const call = (level: string, cookies: ReturnType<typeof cookieJar>) =>
		(DELETE as CallableFunction)({
			url: new URL(`${origin}/api/attribution/touch?consent=${level}`),
			cookies
		});

	it('downgrading to analytics removes only the ad click', async () => {
		const cookies = cookieJar({ fa_attr: '{}', fa_lt: '{}' });
		await call('analytics', cookies);
		expect([...cookies.values.keys()]).toEqual(['fa_attr']);
	});

	it('necessary removes both', async () => {
		const cookies = cookieJar({ fa_attr: '{}', fa_lt: '{}' });
		await call('necessary', cookies);
		expect(cookies.values.size).toBe(0);
	});
});
