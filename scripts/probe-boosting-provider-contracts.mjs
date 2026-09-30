import 'dotenv/config';
import { setDefaultResultOrder } from 'node:dns';

setDefaultResultOrder('ipv4first');

const PROBE_IDS = ['999999999999999991', '999999999999999992'];
const TIMEOUT_MS = 20_000;

const PROVIDERS = [
	{
		id: 'smm_raja',
		url: 'https://www.smmraja.com/api/v2',
		key: process.env.SMMRAJA_API_KEY,
		batchField: 'order'
	},
	{
		id: 'bulk_follows',
		url: 'https://bulkfollows.com/api/v2',
		key: process.env.BULKFOLLOWS_API_KEY,
		batchField: 'orders'
	}
];

function summarizeEntry(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return { shape: Array.isArray(value) ? 'array' : typeof value };
	}
	const record = value;
	if (typeof record.error === 'string') {
		return { shape: 'provider_error', keys: Object.keys(record).sort() };
	}
	return {
		shape: 'status',
		keys: Object.keys(record).sort(),
		status: typeof record.status === 'string' ? record.status : null
	};
}

function summarizePayload(payload, ids) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		return summarizeEntry(payload);
	}
	const record = payload;
	if (typeof record.error === 'string' || typeof record.status === 'string') {
		return summarizeEntry(record);
	}
	return {
		shape: 'status_map',
		keys: Object.keys(record).sort(),
		entries: Object.fromEntries(ids.map((id) => [id, summarizeEntry(record[id])]))
	};
}

function safeTransportError(error, apiKey) {
	if (!(error instanceof Error)) return { name: 'UnknownError' };
	const cause = error.cause && typeof error.cause === 'object' ? error.cause : null;
	const rawMessage = String(error.message || '').slice(0, 160);
	return {
		name: error.name,
		message:
			apiKey && rawMessage.includes(apiKey)
				? rawMessage.replaceAll(apiKey, '[redacted]')
				: rawMessage,
		causeCode: cause && 'code' in cause ? String(cause.code).slice(0, 80) : null
	};
}

async function statusProbe(provider, ids) {
	const body = new URLSearchParams({
		key: provider.key,
		action: 'status',
		[ids.length === 1 ? 'order' : provider.batchField]: ids.join(',')
	});
	const response = await fetch(provider.url, {
		method: 'POST',
		headers: {
			accept: 'application/json',
			'content-type': 'application/x-www-form-urlencoded'
		},
		body,
		signal: AbortSignal.timeout(TIMEOUT_MS)
	});
	const text = await response.text();
	let payload;
	try {
		payload = JSON.parse(text);
	} catch {
		return {
			httpStatus: response.status,
			contentType: response.headers.get('content-type'),
			shape: 'invalid_json',
			responseBytes: Buffer.byteLength(text, 'utf8')
		};
	}
	return {
		httpStatus: response.status,
		contentType: response.headers.get('content-type'),
		...summarizePayload(payload, ids)
	};
}

const report = [];
for (const provider of PROVIDERS) {
	const apiKey = String(provider.key || '').trim();
	if (!apiKey) {
		report.push({ provider: provider.id, configured: false });
		continue;
	}
	const configuredProvider = { ...provider, key: apiKey };
	try {
		report.push({
			provider: provider.id,
			configured: true,
			singleStatus: await statusProbe(configuredProvider, PROBE_IDS.slice(0, 1)),
			batchStatus: await statusProbe(configuredProvider, PROBE_IDS)
		});
	} catch (error) {
		report.push({
			provider: provider.id,
			configured: true,
			transportError: safeTransportError(error, apiKey)
		});
	}
}

console.log(JSON.stringify({ actionSafety: ['status'], providers: report }, null, 2));

if (report.some((entry) => !entry.configured || entry.transportError)) {
	process.exitCode = 1;
}
