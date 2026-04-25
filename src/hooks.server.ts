// Server-side hooks for session management
import { env as publicEnv } from '$env/dynamic/public';
import { env } from '$env/dynamic/private';
import { validateSessionToken } from '$lib/auth/session';
import {
	getAdminContext,
	getRequiredAdminPermission,
	hasAdminPermission
} from '$lib/auth/admin-roles';
import {
	buildAdminAuditAction,
	createAdminAuditLog,
	shouldLogAdminMutation
} from '$lib/services/admin-audit';
import type { Handle, RequestEvent } from '@sveltejs/kit';

function getCanonicalBaseUrl(): URL | null {
	const candidates = [env.CANONICAL_BASE_URL, publicEnv.PUBLIC_BASE_URL, publicEnv.PUBLIC_SITE_URL]
		.map((value) => (value || '').trim())
		.filter(Boolean);

	for (const candidate of candidates) {
		try {
			return new URL(candidate);
		} catch {
			// Ignore invalid URL values and continue.
		}
	}

	return null;
}

function getIncomingHost(event: RequestEvent): string {
	const forwardedHost = event.request.headers.get('x-forwarded-host');
	const host = forwardedHost || event.url.host;
	return (host || '').split(',')[0].trim().toLowerCase();
}

function getRedirectSourceHosts(): Set<string> {
	const fromEnv = (env.CANONICAL_REDIRECT_SOURCE_HOSTS || '')
		.split(',')
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);

	const defaults = ['fastaccs-smm.vercel.app'];
	return new Set([...defaults, ...fromEnv]);
}

function getCanonicalRedirectTarget(event: RequestEvent): URL | null {
	if (event.url.pathname.startsWith('/api/webhooks/')) {
		return null;
	}

	const canonicalBase = getCanonicalBaseUrl();
	if (!canonicalBase) {
		return null;
	}

	const incomingHost = getIncomingHost(event);
	if (!incomingHost) {
		return null;
	}

	const sourceHosts = getRedirectSourceHosts();
	if (!sourceHosts.has(incomingHost)) {
		return null;
	}

	if (incomingHost === canonicalBase.host.toLowerCase()) {
		return null;
	}

	return new URL(`${event.url.pathname}${event.url.search}`, canonicalBase);
}

export const handle: Handle = async ({ event, resolve }) => {
	const canonicalRedirectTarget = getCanonicalRedirectTarget(event);
	if (canonicalRedirectTarget) {
		return new Response(null, {
			status: 308,
			headers: {
				location: canonicalRedirectTarget.toString()
			}
		});
	}

	// Skip CSRF check for webhook endpoints
	// if (event.url.pathname.startsWith('/api/webhooks/')) {
	// 	return resolve(event, {
	// 		filterSerializedResponseHeaders: (name) => name === 'content-type'
	// 	});
	// }

	// Get session token from cookies
	const sessionToken = event.cookies.get('session');

	if (!sessionToken) {
		event.locals.user = null;
		event.locals.session = null;
	} else {
		// Validate session
		const { session, user } = await validateSessionToken(sessionToken);
		event.locals.session = session;
		event.locals.user = user;
	}

	event.locals.adminContext = await getAdminContext(event.locals.user);

	const requiredPermission = getRequiredAdminPermission(event.url.pathname, event.request.method);
	if (requiredPermission && !hasAdminPermission(event.locals.adminContext, requiredPermission)) {
		const isAdminPage = event.url.pathname.startsWith('/admin');
		if (event.url.pathname.startsWith('/api/')) {
			return new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
				status: 403,
				headers: {
					'content-type': 'application/json'
				}
			});
		}

		if (isAdminPage && !event.locals.user) {
			const returnUrl = encodeURIComponent(event.url.pathname + event.url.search);
			return new Response(null, {
				status: 302,
				headers: {
					location: `/auth/login?returnUrl=${returnUrl}`
				}
			});
		}

		return new Response('Forbidden', { status: 403 });
	}

	const response = await resolve(event);

	if (
		event.locals.adminContext &&
		shouldLogAdminMutation(event.url.pathname, event.request.method, response.status)
	) {
		const auditAction = buildAdminAuditAction(event.url.pathname, event.request.method);
		const pathSegments = event.url.pathname.split('/').filter(Boolean);
		const targetUserId =
			pathSegments.includes('users') && auditAction.resourceId ? auditAction.resourceId : null;

		await createAdminAuditLog({
			actorUserId: event.locals.user?.id || null,
			targetUserId,
			action: auditAction.action,
			resourceType: auditAction.resourceType,
			resourceId: auditAction.resourceId,
			description: `${event.request.method.toUpperCase()} ${event.url.pathname}`,
			metadata: {
				status: response.status,
				query: event.url.searchParams.toString().slice(0, 400),
				role: event.locals.adminContext.role
			},
			ipAddress: event.request.headers.get('x-forwarded-for') || null,
			userAgent: event.request.headers.get('user-agent') || null
		});
	}

	return response;
};
