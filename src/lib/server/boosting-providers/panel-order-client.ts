import { BoostProviderError } from './panel-client';
import { parseBoostServiceId } from './service-id';
import { parseBoostComments } from '$lib/helpers/boosting-service-input';
import type {
	BoostProviderId,
	BoostProviderOrderClient,
	BoostProviderOrderState,
	BoostProviderOrderStatus,
	SubmitBoostOrder,
	SubmitBoostOrderResult
} from './types';

type FetchLike = typeof fetch;
export type BoostSubmissionCertainty = 'not_submitted' | 'submission_unknown';

const PROVIDER_CONTRACTS: Record<
	BoostProviderId,
	{ label: string; baseUrl: string; batchStatusParameter: 'order' | 'orders' }
> = {
	smm_raja: {
		label: 'SMM Raja',
		baseUrl: 'https://www.smmraja.com/api/v2',
		batchStatusParameter: 'order'
	},
	bulk_follows: {
		label: 'BulkFollows',
		baseUrl: 'https://bulkfollows.com/api/v2',
		batchStatusParameter: 'orders'
	}
};

export class BoostProviderSubmissionError extends BoostProviderError {
	constructor(
		message: string,
		provider: BoostProviderId,
		code: 'not_configured' | 'invalid_input' | 'provider_rejected' | 'submission_unknown',
		readonly certainty: BoostSubmissionCertainty,
		httpStatus: number | null = null
	) {
		super(message, provider, code, httpStatus);
		this.name = 'BoostProviderSubmissionError';
	}
}

interface PanelOrderClientOptions {
	id: BoostProviderId;
	getApiKey: () => string | undefined;
	/**
	 * Deliberately required so tests can provide a closed transport and production can use the
	 * worker's lease/idempotency gates around this client.
	 */
	fetchImpl: FetchLike;
	timeoutMs?: number;
	maxResponseBytes?: number;
}

function safeMessage(payload: unknown, apiKey: string): string | null {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
	const value = (payload as Record<string, unknown>).error;
	if (typeof value !== 'string' || !value.trim()) return null;
	const message = value.trim().slice(0, 180);
	return apiKey && message.includes(apiKey) ? message.replaceAll(apiKey, '[redacted]') : message;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function parseNonNegativeNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseNonNegativeInteger(value: unknown): number | null {
	const parsed = parseNonNegativeNumber(value);
	return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function normalizeStatus(value: string): BoostProviderOrderState {
	const normalized = value
		.trim()
		.toLowerCase()
		.replace(/[\s_-]+/g, ' ');
	if (normalized === 'pending') return 'pending';
	if (['processing', 'in progress', 'active'].includes(normalized)) return 'in_progress';
	if (normalized === 'completed') return 'completed';
	if (normalized === 'partial') return 'partial';
	if (['canceled', 'cancelled'].includes(normalized)) return 'cancelled';
	if (normalized === 'refunded') return 'refunded';
	if (['failed', 'error', 'rejected'].includes(normalized)) return 'failed';
	return 'unknown';
}

function assertProviderOrderId(value: unknown): string | null {
	const orderId = String(value ?? '').trim();
	return /^[1-9]\d*$/.test(orderId) ? orderId : null;
}

function validateSubmitInput(provider: BoostProviderId, input: SubmitBoostOrder): URLSearchParams {
	const serviceId = parseBoostServiceId(provider, input.serviceId);
	if (!serviceId) {
		throw new BoostProviderSubmissionError(
			'Provider service code is invalid.',
			provider,
			'invalid_input',
			'not_submitted'
		);
	}
	if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > 10_000_000) {
		throw new BoostProviderSubmissionError(
			'Order quantity is outside the safe range.',
			provider,
			'invalid_input',
			'not_submitted'
		);
	}

	let target: URL;
	try {
		target = new URL(input.targetUrl);
	} catch {
		throw new BoostProviderSubmissionError(
			'Order target must be a valid HTTPS URL.',
			provider,
			'invalid_input',
			'not_submitted'
		);
	}
	if (
		target.protocol !== 'https:' ||
		!target.hostname ||
		target.username ||
		target.password ||
		target.toString().length > 2048
	) {
		throw new BoostProviderSubmissionError(
			'Order target must be a valid HTTPS URL.',
			provider,
			'invalid_input',
			'not_submitted'
		);
	}

	if (input.inputMode === 'custom_comments') {
		const parsed = parseBoostComments(input.comments);
		if (parsed.error || parsed.quantity !== input.quantity) {
			throw new BoostProviderSubmissionError(
				parsed.error || 'Comment count does not match quantity.',
				provider,
				'invalid_input',
				'not_submitted'
			);
		}
		return new URLSearchParams({
			action: 'add',
			service: serviceId,
			link: target.toString(),
			comments: parsed.text
		});
	}
	if (input.comments !== undefined) {
		throw new BoostProviderSubmissionError(
			'Custom text requires a custom-comment service.',
			provider,
			'invalid_input',
			'not_submitted'
		);
	}
	return new URLSearchParams({
		action: 'add',
		service: serviceId,
		link: target.toString(),
		quantity: String(input.quantity)
	});
}

function validateStatusIds(provider: BoostProviderId, values: string[]): string[] {
	if (!values.length || values.length > 100) {
		throw new BoostProviderError(
			'Status checks require between 1 and 100 order IDs.',
			provider,
			'invalid_input'
		);
	}
	const ids = values.map(assertProviderOrderId);
	if (ids.some((value) => !value)) {
		throw new BoostProviderError(
			'Provider order IDs must be positive integers.',
			provider,
			'invalid_input'
		);
	}
	return ids as string[];
}

function parseStatusEntry(
	provider: BoostProviderId,
	providerOrderId: string,
	payload: unknown,
	apiKey: string
): BoostProviderOrderStatus {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
		throw new BoostProviderError(
			'Provider returned an invalid order status.',
			provider,
			'invalid_response'
		);
	}
	const record = payload as Record<string, unknown>;
	const error = safeMessage(record, apiKey);
	if (error) {
		return {
			provider,
			providerOrderId,
			state: 'unknown',
			rawStatus: null,
			charge: null,
			currency: null,
			startCount: null,
			remains: null,
			error
		};
	}

	const rawStatus = typeof record.status === 'string' ? record.status.trim() : '';
	const charge = parseNonNegativeNumber(record.charge);
	const startCount = parseNonNegativeInteger(record.start_count);
	// Observed on real BulkFollows Pending orders: the starting count is not known yet.
	// Preserve null instead of fabricating zero; missing or malformed fields still fail closed.
	const pendingStartCount =
		provider === 'bulk_follows' &&
		typeof record.start_count === 'string' &&
		record.start_count.trim() === '';
	const remains = parseNonNegativeInteger(record.remains);
	const currency = String(record.currency ?? '')
		.trim()
		.toUpperCase();
	if (
		!rawStatus ||
		charge === null ||
		(startCount === null && !pendingStartCount) ||
		remains === null ||
		!/^[A-Z]{3}$/.test(currency)
	) {
		throw new BoostProviderError(
			'Provider returned an invalid order status.',
			provider,
			'invalid_response'
		);
	}

	return {
		provider,
		providerOrderId,
		state: normalizeStatus(rawStatus),
		rawStatus,
		charge,
		currency,
		startCount: pendingStartCount ? null : startCount,
		remains,
		error: null
	};
}

async function readBoundedResponse(
	response: Response,
	provider: BoostProviderId,
	maxResponseBytes: number
): Promise<string> {
	const declaredLength = Number(response.headers.get('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
		throw new BoostProviderError(
			'Provider response exceeded the safe size limit.',
			provider,
			'response_too_large',
			response.status
		);
	}
	const text = await response.text();
	if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) {
		throw new BoostProviderError(
			'Provider response exceeded the safe size limit.',
			provider,
			'response_too_large',
			response.status
		);
	}
	return text;
}

export function createPanelOrderClient(options: PanelOrderClientOptions): BoostProviderOrderClient {
	const contract = PROVIDER_CONTRACTS[options.id];
	const timeoutMs = options.timeoutMs ?? 20_000;
	const maxResponseBytes = options.maxResponseBytes ?? 512 * 1024;

	function readApiKey(): string {
		const apiKey = String(options.getApiKey() || '').trim();
		if (!apiKey) {
			throw new BoostProviderError(
				`${contract.label} is not configured.`,
				options.id,
				'not_configured'
			);
		}
		return apiKey;
	}

	async function send(body: URLSearchParams): Promise<{ response: Response; text: string }> {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await options.fetchImpl(contract.baseUrl, {
				method: 'POST',
				headers: {
					accept: 'application/json',
					'content-type': 'application/x-www-form-urlencoded'
				},
				body,
				signal: controller.signal
			});
			return {
				response,
				text: await readBoundedResponse(response, options.id, maxResponseBytes)
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	return {
		id: options.id,

		async submitOrder(input): Promise<SubmitBoostOrderResult> {
			let apiKey: string;
			try {
				apiKey = readApiKey();
			} catch (error) {
				if (error instanceof BoostProviderError) {
					throw new BoostProviderSubmissionError(
						error.message,
						options.id,
						'not_configured',
						'not_submitted'
					);
				}
				throw error;
			}
			const body = validateSubmitInput(options.id, input);
			body.set('key', apiKey);

			try {
				const { response, text } = await send(body);
				if (!response.ok) {
					throw new BoostProviderSubmissionError(
						`Provider submission returned HTTP ${response.status}; its outcome must be reconciled.`,
						options.id,
						'submission_unknown',
						'submission_unknown',
						response.status
					);
				}
				const payload = parseJson(text);
				const rejection = safeMessage(payload, apiKey);
				if (rejection) {
					throw new BoostProviderSubmissionError(
						rejection,
						options.id,
						'provider_rejected',
						'not_submitted',
						response.status
					);
				}
				const orderId =
					payload && typeof payload === 'object' && !Array.isArray(payload)
						? assertProviderOrderId((payload as Record<string, unknown>).order)
						: null;
				if (!orderId) {
					throw new BoostProviderSubmissionError(
						'Provider returned an uncertain submission response; it must be reconciled.',
						options.id,
						'submission_unknown',
						'submission_unknown',
						response.status
					);
				}
				return { provider: options.id, providerOrderId: orderId };
			} catch (error) {
				if (error instanceof BoostProviderSubmissionError) throw error;
				throw new BoostProviderSubmissionError(
					'Provider submission outcome is unknown and must be reconciled.',
					options.id,
					'submission_unknown',
					'submission_unknown',
					error instanceof BoostProviderError ? error.httpStatus : null
				);
			}
		},

		async getStatuses(providerOrderIds): Promise<BoostProviderOrderStatus[]> {
			const apiKey = readApiKey();
			const ids = validateStatusIds(options.id, providerOrderIds);
			const body = new URLSearchParams({
				key: apiKey,
				action: 'status',
				[ids.length === 1 ? 'order' : contract.batchStatusParameter]: ids.join(',')
			});

			let response: Response;
			let text: string;
			try {
				({ response, text } = await send(body));
			} catch (error) {
				if (error instanceof BoostProviderError) throw error;
				if (error instanceof Error && error.name === 'AbortError') {
					throw new BoostProviderError('Provider status request timed out.', options.id, 'timeout');
				}
				throw new BoostProviderError(
					'Provider status request failed.',
					options.id,
					'network_error'
				);
			}
			if (!response.ok) {
				throw new BoostProviderError(
					`Provider status request failed with HTTP ${response.status}.`,
					options.id,
					'http_error',
					response.status
				);
			}
			const payload = parseJson(text);
			const providerError = safeMessage(payload, apiKey);
			if (providerError) {
				throw new BoostProviderError(providerError, options.id, 'provider_error', response.status);
			}

			if (ids.length === 1) {
				return [parseStatusEntry(options.id, ids[0], payload, apiKey)];
			}
			if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
				throw new BoostProviderError(
					'Provider returned an invalid batch status response.',
					options.id,
					'invalid_response'
				);
			}
			const statusMap = payload as Record<string, unknown>;
			return ids.map((id) => {
				if (!(id in statusMap)) {
					throw new BoostProviderError(
						'Provider omitted an order from the batch status response.',
						options.id,
						'invalid_response'
					);
				}
				return parseStatusEntry(options.id, id, statusMap[id], apiKey);
			});
		},

		// BulkFollows' single-refill read contract is separate from order status. Do not guess
		// that SMM Raja supports the same action, or dispatch a refill while polling its state.
		...(options.id === 'bulk_follows'
			? {
					async getRefillStatus(refillId: string) {
						const apiKey = readApiKey();
						const id = validateStatusIds(options.id, [refillId])[0];
						let result: { response: Response; text: string };
						try {
							result = await send(
								new URLSearchParams({ key: apiKey, action: 'refill_status', refill: id })
							);
						} catch {
							throw new BoostProviderError(
								'Provider refill status is unavailable.',
								options.id,
								'network_error'
							);
						}
						if (!result.response.ok)
							throw new BoostProviderError(
								'Provider refill status is unavailable.',
								options.id,
								'http_error',
								result.response.status
							);
						const payload = parseJson(result.text);
						const providerError = safeMessage(payload, apiKey);
						if (providerError)
							throw new BoostProviderError(providerError, options.id, 'provider_error');
						if (
							!payload ||
							typeof payload !== 'object' ||
							Array.isArray(payload) ||
							typeof (payload as Record<string, unknown>).status !== 'string'
						) {
							throw new BoostProviderError(
								'Provider returned an invalid refill status.',
								options.id,
								'invalid_response'
							);
						}
						const raw = String((payload as Record<string, unknown>).status)
							.trim()
							.toLowerCase()
							.replace(/\s+/g, ' ');
						const state =
							raw === 'completed'
								? 'completed'
								: ['processing', 'in progress', 'active'].includes(raw)
									? 'in_progress'
									: ['pending', 'queued'].includes(raw)
										? 'pending'
										: ['rejected', 'cancelled', 'canceled', 'failed'].includes(raw)
											? 'rejected'
											: 'unknown';
						return { state } as { state: import('./types').BoostRefillState };
					}
				}
			: {}),

		async requestRefill(providerOrderId) {
			const apiKey = readApiKey();
			const orderId = validateStatusIds(options.id, [providerOrderId])[0];
			const body = new URLSearchParams({ key: apiKey, action: 'refill', order: orderId });
			let response: Response;
			let text: string;
			try {
				({ response, text } = await send(body));
			} catch (error) {
				throw new BoostProviderError(
					error instanceof Error && error.name === 'AbortError'
						? 'Provider refill request timed out.'
						: 'Provider refill request failed.',
					options.id,
					error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network_error'
				);
			}
			if (!response.ok) {
				throw new BoostProviderError(
					`Provider refill request failed with HTTP ${response.status}.`,
					options.id,
					'http_error',
					response.status
				);
			}
			const payload = parseJson(text);
			const providerError = safeMessage(payload, apiKey);
			if (providerError) {
				throw new BoostProviderError(providerError, options.id, 'provider_error', response.status);
			}
			const record =
				payload && typeof payload === 'object' && !Array.isArray(payload)
					? (payload as Record<string, unknown>)
					: null;
			// An order ID is not proof that a refill was created.
			const refillId = String(record?.refill ?? '').trim();
			if (!/^[1-9]\d*$/.test(refillId)) {
				throw new BoostProviderError(
					'Provider returned an invalid refill response.',
					options.id,
					'invalid_response'
				);
			}
			return { provider: options.id, refillId };
		}
	};
}
