import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	phoneAttempt: { findMany: vi.fn() },
	phoneRental: { findMany: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));

import {
	summarizeReliability,
	candidateKeyFromRental,
	loadCandidateReliability
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
		expect(stats.get('pvapins:Whatsapp24')).toEqual({ received: 2, total: 3, reliability: 2 / 3 });
		expect(stats.get('pvapins:Whatsapp46')).toEqual({ received: 0, total: 2, reliability: 0 });
	});

	it('is empty for no rows', () => {
		expect(summarizeReliability([]).size).toBe(0);
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
		expect(stats.get('hubman:market:1:58')?.reliability).toBe(0);
		expect(stats.get('pvapins:Whatsapp24')?.reliability).toBe(1);
		expect(stats.get('pvapins:market:1:58')?.reliability).toBe(1);
		expect(stats.get('hubman:*')?.reliability).toBe(0);
		expect(stats.get('pvapins:*')?.reliability).toBe(1);
		expect(prismaMock.phoneAttempt.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ outcome: { in: ['otp_received', 'otp_timeout'] } })
			})
		);
	});
});
