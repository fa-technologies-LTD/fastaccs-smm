// Server-side hooks for session management
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
import { startPaymentReconciliationScheduler } from '$lib/services/payment-reconciliation';
import { startWinBackScheduler } from '$lib/services/winback';
import type { Handle } from '@sveltejs/kit';

startPaymentReconciliationScheduler();
startWinBackScheduler();

export const handle: Handle = async ({ event, resolve }) => {
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
