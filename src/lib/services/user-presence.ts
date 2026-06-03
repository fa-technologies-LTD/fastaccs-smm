import { prisma } from '$lib/prisma';

const PRESENCE_WRITE_INTERVAL_MS = 30 * 60 * 1000;

export function shouldRecordUserPresence(pathname: string, method: string): boolean {
	if (method !== 'GET') return false;
	if (pathname.startsWith('/api/')) return false;
	return !pathname.includes('.');
}

export async function recordUserPresenceIfStale(user: {
	id: string;
	lastSeenAt?: Date | null;
}): Promise<void> {
	const now = new Date();
	if (user.lastSeenAt && now.getTime() - user.lastSeenAt.getTime() < PRESENCE_WRITE_INTERVAL_MS) {
		return;
	}

	await prisma.user.update({
		where: { id: user.id },
		data: { lastSeenAt: now }
	});

	user.lastSeenAt = now;
}
