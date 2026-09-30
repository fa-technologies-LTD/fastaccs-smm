import { normalizeBoostProviderCatalog } from './catalog-normalizer';
import type {
	BoostProviderBalance,
	BoostProviderId,
	BoostProviderReadClient,
	BoostProviderService
} from './types';

type PanelAction = 'services' | 'balance';
type FetchLike = typeof fetch;

export type BoostProviderErrorCode =
	| 'not_configured'
	| 'invalid_input'
	| 'timeout'
	| 'network_error'
	| 'http_error'
	| 'invalid_json'
	| 'invalid_response'
	| 'provider_error'
	| 'provider_rejected'
	| 'submission_unknown'
	| 'response_too_large';

export class BoostProviderError extends Error {
	constructor(
		message: string,
		readonly provider: BoostProviderId,
		readonly code: BoostProviderErrorCode,
		readonly httpStatus: number | null = null
	) {
		super(message);
		this.name = 'BoostProviderError';
	}
}

interface PanelClientOptions {
	id: BoostProviderId;
	label: string;
	baseUrl: string;
	getApiKey: () => string | undefined;
	fetchImpl?: FetchLike;
	timeoutMs?: number;
	maxResponseBytes?: number;
}

function safeProviderMessage(payload: unknown, apiKey: string): string | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
	const message = (payload as Record<string, unknown>).error;
	if (typeof message !== 'string' || !message.trim()) return null;
	const trimmed = message.trim().slice(0, 180);
	return apiKey && trimmed.includes(apiKey) ? trimmed.replaceAll(apiKey, '[redacted]') : trimmed;
}

function parseJson(text: string, provider: BoostProviderId): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new BoostProviderError(
			'Provider returned a non-JSON response.',
			provider,
			'invalid_json'
		);
	}
}

export function createPanelReadClient(options: PanelClientOptions): BoostProviderReadClient {
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? 20_000;
	const maxResponseBytes = options.maxResponseBytes ?? 16 * 1024 * 1024;

	async function request(action: PanelAction): Promise<unknown> {
		const apiKey = String(options.getApiKey() || '').trim();
		if (!apiKey) {
			throw new BoostProviderError(
				`${options.label} is not configured.`,
				options.id,
				'not_configured'
			);
		}

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetchImpl(options.baseUrl, {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/x-www-form-urlencoded'
				},
				body: new URLSearchParams({ key: apiKey, action }),
				signal: controller.signal
			});
			const declaredLength = Number(response.headers.get('content-length'));
			if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
				throw new BoostProviderError(
					'Provider response exceeded the safe size limit.',
					options.id,
					'response_too_large',
					response.status
				);
			}

			const text = await response.text();
			if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
				throw new BoostProviderError(
					'Provider response exceeded the safe size limit.',
					options.id,
					'response_too_large',
					response.status
				);
			}
			if (!response.ok) {
				throw new BoostProviderError(
					`Provider request failed with HTTP ${response.status}.`,
					options.id,
					'http_error',
					response.status
				);
			}

			const payload = parseJson(text, options.id);
			const providerMessage = safeProviderMessage(payload, apiKey);
			if (providerMessage) {
				throw new BoostProviderError(
					providerMessage,
					options.id,
					'provider_error',
					response.status
				);
			}
			return payload;
		} catch (error) {
			if (error instanceof BoostProviderError) throw error;
			if (error instanceof Error && error.name === 'AbortError') {
				throw new BoostProviderError('Provider request timed out.', options.id, 'timeout');
			}
			throw new BoostProviderError('Provider request failed.', options.id, 'network_error');
		} finally {
			clearTimeout(timeout);
		}
	}

	return {
		id: options.id,
		label: options.label,
		isConfigured: () => Boolean(String(options.getApiKey() || '').trim()),

		async listServices(): Promise<BoostProviderService[]> {
			return normalizeBoostProviderCatalog(options.id, await request('services'));
		},

		async getBalance(): Promise<BoostProviderBalance> {
			const payload = await request('balance');
			if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
				throw new BoostProviderError(
					'Provider returned an invalid balance response.',
					options.id,
					'invalid_response'
				);
			}
			const record = payload as Record<string, unknown>;
			const amount = Number(record.balance);
			const currency = String(record.currency || '')
				.trim()
				.toUpperCase();
			if (!Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) {
				throw new BoostProviderError(
					'Provider returned an invalid balance response.',
					options.id,
					'invalid_response'
				);
			}
			return { provider: options.id, amount, currency };
		}
	};
}
