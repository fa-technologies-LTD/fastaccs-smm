// Session management for FastAccs using Lucia approach
import { prisma } from '$lib/prisma';
import type { User, Session } from '@prisma/client';
import type { RequestEvent } from '@sveltejs/kit';

export interface SessionValidationResult {
	session: Session | null;
	user: User | null;
}

// In-memory session cache
interface CachedSession {
	session: Session;
	user: User;
	cachedAt: number;
}

const sessionCache = new Map<string, CachedSession>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function clearUserSessionsFromCache(userId: string, keepSessionId?: string): void {
	for (const [sessionId, cached] of sessionCache.entries()) {
		if (cached.user.id !== userId) continue;
		if (keepSessionId && sessionId === keepSessionId) continue;
		sessionCache.delete(sessionId);
	}
}

// Clean up expired cache entries periodically
if (typeof setInterval !== 'undefined') {
	setInterval(() => {
		const now = Date.now();
		for (const [key, value] of sessionCache.entries()) {
			if (now - value.cachedAt > CACHE_TTL) {
				sessionCache.delete(key);
			}
		}
	}, 60 * 1000); // Clean up every minute
}

// Generate a secure session token
export function generateSessionToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	const token = encodeBase64urlNoPadding(bytes);
	return token;
}

// Create a new session
export async function createSession(token: string, userId: string): Promise<Session> {
	// Use the token directly as session ID for simplicity
	const sessionId = token;
	const session = {
		id: sessionId,
		userId,
		expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days
		lastRefreshedAt: new Date(),
		createdAt: new Date()
	};

	await prisma.session.create({
		data: session
	});

	return session;
}

// Validate session token
export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
	const sessionId = token;

	// Check cache first
	const cached = sessionCache.get(sessionId);
	if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
		if (!cached.user.isActive) {
			await prisma.session.deleteMany({ where: { id: sessionId } });
			sessionCache.delete(sessionId);
			return { session: null, user: null };
		}

		// Check if cached session is still valid
		if (Date.now() < cached.session.expiresAt.getTime()) {
			return { session: cached.session, user: cached.user };
		} else {
			// Cached session expired, remove from cache
			sessionCache.delete(sessionId);
		}
	}

	// Cache miss or expired - query database
	const result = await prisma.session.findUnique({
		where: { id: sessionId },
		include: { user: true }
	});

	if (!result) {
		sessionCache.delete(sessionId); // Ensure removed from cache
		return { session: null, user: null };
	}

	const { user, ...session } = result;

	if (!user.isActive) {
		await prisma.session.deleteMany({ where: { id: sessionId } });
		sessionCache.delete(sessionId);
		return { session: null, user: null };
	}

	if (Date.now() >= session.expiresAt.getTime()) {
		await prisma.session.delete({ where: { id: sessionId } });
		sessionCache.delete(sessionId); // Remove from cache
		return { session: null, user: null };
	}

	// Only refresh if session expires in 15 days AND hasn't been refreshed in the last hour
	const REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour
	const shouldRefresh = 
		Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15 &&
		Date.now() - session.lastRefreshedAt.getTime() > REFRESH_INTERVAL;

	if (shouldRefresh) {
		// Refresh session expiry
		session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
		session.lastRefreshedAt = new Date();
		await prisma.session.update({
			where: { id: session.id },
			data: { 
				expiresAt: session.expiresAt,
				lastRefreshedAt: session.lastRefreshedAt
			}
		});
		// Invalidate cache so next request gets fresh data
		sessionCache.delete(sessionId);
	}

	// Store in cache
	sessionCache.set(sessionId, {
		session,
		user,
		cachedAt: Date.now()
	});

	return { session, user };
}

// Invalidate session
export async function invalidateSession(sessionId: string): Promise<void> {
	await prisma.session.deleteMany({ where: { id: sessionId } });
	sessionCache.delete(sessionId);
}

export async function invalidateUserSessions(
	userId: string,
	options: { keepSessionId?: string } = {}
): Promise<void> {
	const where =
		options.keepSessionId && options.keepSessionId.trim()
			? {
					userId,
					id: { not: options.keepSessionId.trim() }
				}
			: { userId };

	await prisma.session.deleteMany({ where });
	clearUserSessionsFromCache(userId, options.keepSessionId);
}

// Set session cookie
export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		expires: expiresAt,
		path: '/'
	});
}

// Delete session cookie
export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set('session', '', {
		httpOnly: true,
		sameSite: 'lax',
		secure: event.url.protocol === 'https:',
		maxAge: 0,
		path: '/'
	});
}

function encodeBase64urlNoPadding(bytes: Uint8Array): string {
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
