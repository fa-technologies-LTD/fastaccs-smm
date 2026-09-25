import { describe, expect, it } from 'vitest';
import {
	isLocalDataReadOnly,
	localReadOnlyResponse,
	normalizeLocalDataMode,
	shouldBlockLocalRequest
} from './local-data-safety';

describe('local data safety', () => {
	it('fails safe to production-readonly when the mode is missing or invalid', () => {
		expect(normalizeLocalDataMode(undefined)).toBe('production-readonly');
		expect(normalizeLocalDataMode('production')).toBe('production-readonly');
		expect(isLocalDataReadOnly({ dev: true, configuredMode: undefined })).toBe(true);
	});

	it('allows mutations only for an explicitly identified writable data mode', () => {
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'staging',
				method: 'POST',
				pathname: '/api/orders'
			})
		).toBe(false);
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'production-e2e',
				method: 'POST',
				pathname: '/api/orders'
			})
		).toBe(false);
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: undefined,
				method: 'POST',
				pathname: '/api/orders'
			})
		).toBe(true);
	});

	it('recognizes the deliberate live E2E mode without weakening invalid-mode safety', () => {
		expect(normalizeLocalDataMode('production-e2e')).toBe('production-e2e');
		expect(normalizeLocalDataMode('production-write')).toBe('production-readonly');
	});

	it('allows only the narrow interaction set in production-preview mode', () => {
		expect(isLocalDataReadOnly({ dev: true, configuredMode: 'production-preview' })).toBe(true);
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'production-preview',
				method: 'POST',
				pathname: '/api/cart/refresh'
			})
		).toBe(false);
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'production-preview',
				method: 'POST',
				pathname: '/api/push/subscribe'
			})
		).toBe(false);
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'production-preview',
				method: 'POST',
				pathname: '/api/orders'
			})
		).toBe(true);
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'production-preview',
				method: 'POST',
				pathname: '/api/admin/orders/refund'
			})
		).toBe(true);
	});

	it('does not affect deployed production requests', () => {
		expect(
			shouldBlockLocalRequest({
				dev: false,
				configuredMode: undefined,
				hostname: 'smm.fastaccs.com',
				method: 'POST',
				pathname: '/api/orders'
			})
		).toBe(false);
	});

	it('also protects localhost production previews where the framework dev flag is false', () => {
		expect(
			shouldBlockLocalRequest({
				dev: false,
				configuredMode: undefined,
				hostname: '127.0.0.1',
				method: 'POST',
				pathname: '/api/orders'
			})
		).toBe(true);
	});

	it('allows normal reads but blocks mutating GET cron routes in readonly mode', () => {
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'production-readonly',
				method: 'GET',
				pathname: '/numbers'
			})
		).toBe(false);
		expect(
			shouldBlockLocalRequest({
				dev: true,
				configuredMode: 'production-readonly',
				method: 'GET',
				pathname: '/api/internal/cron/phone-rentals-sweep'
			})
		).toBe(true);
	});

	it('returns a structured error for blocked API mutations', async () => {
		const response = localReadOnlyResponse('/api/orders');
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({
			success: false,
			code: 'LOCAL_DATA_READ_ONLY'
		});
	});
});
