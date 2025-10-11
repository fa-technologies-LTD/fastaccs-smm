// Session management for FastAccs using Lucia approach
import { prisma } from '$lib/prisma';
import type { User, Session } from '@prisma/client';
import type { RequestEvent } from '@sveltejs/kit';

export interface SessionValidationResult {
	session: Session | null;
	user: User | null;
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

	const result = await prisma.session.findUnique({
		where: { id: sessionId },
		include: { user: true }
	});

	if (!result) {
		return { session: null, user: null };
	}

	const { user, ...session } = result;

	if (Date.now() >= session.expiresAt.getTime()) {
		await prisma.session.delete({ where: { id: sessionId } });
		return { session: null, user: null };
	}

	if (Date.now() >= session.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
		// Refresh session if it expires in 15 days
		session.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
		await prisma.session.update({
			where: { id: session.id },
			data: { expiresAt: session.expiresAt }
		});
	}

	return { session, user };
}

// Invalidate session
export async function invalidateSession(sessionId: string): Promise<void> {
	await prisma.session.delete({ where: { id: sessionId } });
}

// Set session cookie
export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'lax',
		expires: expiresAt,
		path: '/'
	});
}

// Delete session cookie
export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set('session', '', {
		httpOnly: true,
		sameSite: 'lax',
		maxAge: 0,
		path: '/'
	});
}

function encodeBase64urlNoPadding(bytes: Uint8Array): string {
	const base64 = btoa(String.fromCharCode(...bytes));
	return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
