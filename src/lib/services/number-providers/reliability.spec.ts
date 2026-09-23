import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	phoneAttempt: { findMany: vi.fn() },
	phoneRental: { findMany: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import {
	summarizeReliability,
	summarizeRouteHealth,
	candidateKeyFromRental,
	exactRouteReliabilityKey,
	loadCandidateReliability,
	routeProtectionState,
	ROUTE_BLOCK_MS,
	ROUTE_DEPRIORITIZE_MS,
	ROUTE_OOS_BLOCK_MS
} from './reliability';

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.phoneRental.findMany.mockResolvedValue([]);
});

describe('candidateKeyFromRental', () => {
	it('keys a pvapins rental by its app-variant (the supplier)', () => {
		expect(
			candidateKeyFromRental({
				provider: 'pvapins',
				providerRef: '13865902416|USA|Whatsapp24',
				serviceId: 1
			})
		).toBe('pvapins:Whatsapp24');
	});
	it('keys a hub-man rental by service id', () => {
		expect(candidateKeyFromRental({ provider: 'hubman', providerRef: null, serviceId: 1 })).toBe(
			'hubman:1'
		);
	});
	it('falls back to hub-man keying when a pvapins ref is missing', () => {
		expect(candidateKeyFromRental({ provider: 'pvapins', providerRef: null, serviceId: 2 })).toBe(
			'hubman:2'
		);
	});
});

describe('summarizeReliability', () => {
	it('computes per-supplier success rate', () => {
		const stats = summarizeReliability([
			{ key: 'pvapins:Whatsapp24', received: true },
			{ key: 'pvapins:Whatsapp24', received: true },
			{ key: 'pvapins:Whatsapp24', received: false },
			{ key: 'pvapins:Whatsapp46', received: false },
			{ key: 'pvapins:Whatsapp46', received: false }
		]);
		expect(stats.get('pvapins:Whatsapp24')).toMatchObject({
			received: 2,
			total: 3,
			reliability: 2 / 3,
			consecutiveFailures: 1
		});
		expect(stats.get('pvapins:Whatsapp46')).toMatchObject({
			received: 0,
			total: 2,
			reliability: 0,
			consecutiveFailures: 2
		});
	});

	it('is empty for no rows', () => {
		expect(summarizeReliability([]).size).toBe(0);
	});
});

describe('route protection', () => {
	it('deprioritizes after two consecutive no-code outcomes and blocks after three', () => {
		expect(routeProtectionState({ consecutiveFailures: 2 })).toBe('deprioritized');
		expect(routeProtectionState({ consecutiveFailures: 3 })).toBe('blocked');
	});

	it('returns a route on bottom-of-queue probation after its cooldown', () => {
		const now = new Date('2026-09-21T12:00:00Z');
		expect(
			routeProtectionState(
				{
					consecutiveFailures: 2,
					lastResolvedAt: new Date(now.getTime() - ROUTE_DEPRIORITIZE_MS - 1)
				},
				now
			)
		).toBe('probation');
		expect(
			routeProtectionState(
				{
					consecutiveFailures: 3,
					lastResolvedAt: new Date(now.getTime() - ROUTE_BLOCK_MS - 1)
				},
				now
			)
		).toBe('probation');
	});

	it('temporarily blocks a supplier listing after two consecutive OOS responses', () => {
		const now = new Date('2026-09-21T12:00:00Z');
		expect(
			routeProtectionState(
				{ consecutiveOos: 2, lastAttemptAt: new Date(now.getTime() - 1_000) },
				now
			)
		).toBe('blocked');
		expect(
			routeProtectionState(
				{ consecutiveOos: 2, lastAttemptAt: new Date(now.getTime() - ROUTE_OOS_BLOCK_MS - 1) },
				now
			)
		).toBe('probation');
	});

	it('resets an OOS streak after a successful rent', () => {
		const stats = summarizeRouteHealth([
			{ key: 'route', outcome: 'oos', createdAt: '2026-09-21T10:00:00Z' },
			{ key: 'route', outcome: 'oos', createdAt: '2026-09-21T10:01:00Z' },
			{ key: 'route', outcome: 'rented', createdAt: '2026-09-21T10:02:00Z' }
		]);
		expect(stats.get('route')?.consecutiveOos).toBe(0);
	});
});

describe('loadCandidateReliability — OTP delivery only', () => {
	it('learns from resolved attempts and keeps providers co-equal', async () => {
		prismaMock.phoneAttempt.findMany.mockResolvedValue([
			{ orderItemId: 'hub-1', provider: 'hubman', providerServiceRef: '1', outcome: 'otp_timeout' },
			{
				orderItemId: 'pv-1',
				provider: 'pvapins',
				providerServiceRef: 'Whatsapp24',
				outcome: 'otp_received'
			},
			{
				orderItemId: 'pv-2',
				provider: 'pvapins',
				providerServiceRef: 'Whatsapp24',
				outcome: 'otp_received'
			}
		]);
		prismaMock.phoneRental.findMany.mockResolvedValue([
			{ orderItemId: 'hub-1', serviceId: 1, countryId: 58 },
			{ orderItemId: 'pv-1', serviceId: 1, countryId: 58 },
			{ orderItemId: 'pv-2', serviceId: 1, countryId: 58 }
		]);
		const stats = await loadCandidateReliability();
		expect(stats.get(exactRouteReliabilityKey('hubman', '1', 1, 58))?.reliability).toBe(0);
		expect(stats.get(exactRouteReliabilityKey('pvapins', 'Whatsapp24', 1, 58))?.reliability).toBe(
			1
		);
		expect(stats.get('hubman:market:1:58')?.reliability).toBe(0);
		expect(stats.get('pvapins:Whatsapp24')?.reliability).toBe(1);
		expect(stats.get('pvapins:market:1:58')?.reliability).toBe(1);
		expect(stats.get('hubman:*')?.reliability).toBe(0);
		expect(stats.get('pvapins:*')?.reliability).toBe(1);
		expect(prismaMock.phoneAttempt.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					outcome: { in: ['otp_received', 'otp_timeout', 'rented', 'oos'] }
				})
			})
		);
	});

	it('keeps an old failed exact route on probation until positive evidence clears it', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-23T12:00:00Z'));
		try {
			prismaMock.phoneAttempt.findMany.mockResolvedValue([
				{
					orderItemId: 'old-1',
					provider: 'hubman',
					providerServiceRef: '44',
					outcome: 'otp_timeout',
					createdAt: new Date('2026-08-20T10:00:00Z'),
					updatedAt: new Date('2026-08-20T10:20:00Z')
				},
				{
					orderItemId: 'old-2',
					provider: 'hubman',
					providerServiceRef: '44',
					outcome: 'otp_timeout',
					createdAt: new Date('2026-08-21T10:00:00Z'),
					updatedAt: new Date('2026-08-21T10:20:00Z')
				}
			]);
			prismaMock.phoneRental.findMany.mockResolvedValue([
				{ orderItemId: 'old-1', serviceId: 1, countryId: 58 },
				{ orderItemId: 'old-2', serviceId: 1, countryId: 58 }
			]);

			const stats = await loadCandidateReliability(14);
			const route = stats.get(exactRouteReliabilityKey('hubman', '44', 1, 58));

			expect(route).toMatchObject({ total: 0, consecutiveFailures: 2 });
			expect(routeProtectionState(route!, Date.now())).toBe('probation');
			expect(prismaMock.phoneAttempt.findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.objectContaining({ createdAt: { gte: new Date('2026-08-10T00:00:00Z') } })
				})
			);
		} finally {
			vi.useRealTimers();
		}
	});
});
