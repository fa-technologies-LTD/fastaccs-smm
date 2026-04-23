import { prisma } from '$lib/prisma';
import type { Prisma } from '@prisma/client';

interface AdminAuditLogInput {
	actorUserId?: string | null;
	targetUserId?: string | null;
	action: string;
	resourceType: string;
	resourceId?: string | null;
	description?: string | null;
	metadata?: Record<string, unknown>;
	ipAddress?: string | null;
	userAgent?: string | null;
}

function sanitizeNullableString(value: unknown, maxLength = 500): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.slice(0, maxLength);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return value;
	}

	if (value === null) {
		return 'null';
	}

	if (Array.isArray(value)) {
		return value.slice(0, 50).map((entry) => toJsonValue(entry));
	}

	if (typeof value === 'object') {
		const objectValue = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.entries(objectValue).slice(0, 50).map(([key, nested]) => [key, toJsonValue(nested)])
		);
	}

	return String(value);
}

function safeMetadata(metadata: Record<string, unknown> | undefined): Prisma.InputJsonObject {
	if (!metadata) return {};
	return Object.fromEntries(
		Object.entries(metadata).slice(0, 50).map(([key, value]) => [key, toJsonValue(value)])
	);
}

function sanitizeUuid(value: unknown): string | null {
	const parsed = sanitizeNullableString(value, 120);
	if (!parsed) return null;
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
		parsed
	)
		? parsed
		: null;
}

export async function createAdminAuditLog(input: AdminAuditLogInput): Promise<void> {
	try {
		await prisma.adminAuditLog.create({
			data: {
				actorUserId: sanitizeUuid(input.actorUserId),
				targetUserId: sanitizeUuid(input.targetUserId),
				action: input.action.slice(0, 120),
				resourceType: input.resourceType.slice(0, 120),
				resourceId: sanitizeNullableString(input.resourceId, 120),
				description: sanitizeNullableString(input.description, 2_000),
				metadata: safeMetadata(input.metadata),
				ipAddress: sanitizeNullableString(input.ipAddress, 120),
				userAgent: sanitizeNullableString(input.userAgent, 500)
			}
		});
	} catch (error) {
		console.warn('Failed to write admin audit log:', error);
	}
}

function isWriteMethod(method: string): boolean {
	const normalized = method.toUpperCase();
	return normalized === 'POST' || normalized === 'PUT' || normalized === 'PATCH' || normalized === 'DELETE';
}

const SENSITIVE_PATH_PREFIXES = [
	'/api/admin',
	'/api/orders',
	'/api/payments/reconcile',
	'/api/accounts',
	'/api/batches',
	'/api/categories',
	'/api/send-email',
	'/admin/settings'
];

export function shouldLogAdminMutation(pathname: string, method: string, status: number): boolean {
	if (!isWriteMethod(method)) return false;
	if (status >= 500) return false;
	return SENSITIVE_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function normalizePathPart(value: string | undefined): string {
	if (!value) return 'unknown';
	return value.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
}

export function buildAdminAuditAction(pathname: string, method: string): {
	action: string;
	resourceType: string;
	resourceId: string | null;
} {
	const segments = pathname.split('/').filter(Boolean);
	const resourceType = normalizePathPart(segments[1] || segments[0] || 'unknown');
	const resourceId = segments.find((segment) =>
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(segment)
	);
	const action = `${method.toUpperCase()} ${normalizePathPart(pathname.replace(/\//g, '_'))}`;

	return {
		action,
		resourceType,
		resourceId: resourceId || null
	};
}
