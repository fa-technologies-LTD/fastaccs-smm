import type {
	BoostingActionType,
	BoostingPlatform,
	LinkValidationResult
} from '$lib/helpers/social-link-validator';
import { validateLinkForAction } from '$lib/helpers/social-link-validator';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 4;
const DEFAULT_TIMEOUT_MS = 4_000;

export interface BoostingLinkResolution extends LinkValidationResult {
	resolvedRedirect: boolean;
}

interface ResolveOptions {
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

async function cancelBody(response: Response): Promise<void> {
	try {
		await response.body?.cancel();
	} catch {
		// The headers are all we need; a body cancellation failure should not reject the customer link.
	}
}

async function readRedirect(
	url: string,
	fetchImpl: typeof fetch,
	signal: AbortSignal
): Promise<Response> {
	const init: RequestInit = {
		method: 'HEAD',
		redirect: 'manual',
		signal,
		headers: { accept: 'text/html,application/xhtml+xml' }
	};
	let response = await fetchImpl(url, init);
	if (response.status === 403 || response.status === 405) {
		await cancelBody(response);
		response = await fetchImpl(url, {
			...init,
			method: 'GET',
			headers: { ...init.headers, range: 'bytes=0-0' }
		});
	}
	return response;
}

export async function resolveBoostingLink(
	platform: BoostingPlatform,
	actionType: BoostingActionType,
	rawUrl: string,
	options: ResolveOptions = {}
): Promise<BoostingLinkResolution> {
	const initial = validateLinkForAction(platform, actionType, rawUrl);
	if (!initial.valid || !initial.normalizedUrl || !initial.needsManualReview) {
		return { ...initial, resolvedRedirect: false };
	}

	const fetchImpl = options.fetchImpl ?? fetch;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	let currentUrl = initial.normalizedUrl;
	let followedRedirect = false;
	try {
		for (let count = 0; count < MAX_REDIRECTS; count += 1) {
			// This validation happens before every request. A redirect to an unrelated host is rejected
			// without allowing the server to contact it, keeping this helper SSRF-safe.
			const currentCheck = validateLinkForAction(platform, actionType, currentUrl);
			if (!currentCheck.valid || !currentCheck.normalizedUrl) {
				return { ...currentCheck, resolvedRedirect: followedRedirect };
			}
			currentUrl = currentCheck.normalizedUrl;
			const response = await readRedirect(currentUrl, fetchImpl, controller.signal);
			const location = response.headers.get('location');
			await cancelBody(response);
			if (!REDIRECT_STATUSES.has(response.status) || !location) break;
			let nextUrl: string;
			try {
				nextUrl = new URL(location, currentUrl).toString();
			} catch {
				break;
			}
			const redirectCheck = validateLinkForAction(platform, actionType, nextUrl);
			if (!redirectCheck.valid || !redirectCheck.normalizedUrl) {
				return { ...redirectCheck, resolvedRedirect: followedRedirect };
			}
			followedRedirect = true;
			currentUrl = redirectCheck.normalizedUrl;
			if (!redirectCheck.needsManualReview) {
				return { ...redirectCheck, resolvedRedirect: true };
			}
		}
	} catch {
		// Network trouble is not proof that an official link is wrong. Preserve it for manual review.
	} finally {
		clearTimeout(timeout);
	}

	const finalCheck = validateLinkForAction(platform, actionType, currentUrl);
	return { ...finalCheck, resolvedRedirect: followedRedirect };
}
