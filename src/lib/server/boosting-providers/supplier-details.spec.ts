import { beforeEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
	boostCustomerOffer: { findFirst: vi.fn() },
	boostProviderState: { findMany: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: db }));
import { loadBoostSupplierDetails } from './supplier-details';
const now = new Date('2026-10-15T12:00:00Z');
function route(provider: string, state: string) {
	return {
		state,
		equivalenceApproved: false,
		verifiedSignals: [] as string[],
		verifiedRefillDays: 30,
		reliabilityObservations: 0,
		consecutiveFailures: 0,
		providerService: {
			id: provider,
			provider,
			serviceId: 'demo',
			name: 'Test service 30 days refill',
			category: '',
			description: null,
			ratePerThousand: null,
			minQuantity: 10,
			maxQuantity: 10000,
			lastSeenAt: now,
			unavailableAt: null,
			catalogueStatus: 'current',
			refillAdvertised: true,
			privateRawResponse: 'must-not-leak'
		}
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	db.boostCustomerOffer.findFirst.mockResolvedValue({
		id: 'offer',
		routes: [route('smm_raja', 'enabled'), route('bulk_follows', 'paused')]
	});
	db.boostProviderState.findMany.mockResolvedValue([
		{
			provider: 'smm_raja',
			balance: 0,
			currency: 'USD',
			lastBalanceSuccessAt: now,
			enabled: true,
			circuitOpen: false,
			privateKey: 'must-not-leak'
		}
	]);
});
it('shows saved records for both providers including paused mappings, without treating claims as verified', async () => {
	const result = await loadBoostSupplierDetails('offer', db as never);
	expect(result?.providers).toHaveLength(2);
	expect(result?.providers[0]).toMatchObject({
		balance: 0,
		balanceCheckedAt: now.toISOString(),
		services: [
			{
				state: 'enabled',
				approved: false,
				rateUsd: null,
				refillAdvertised: true,
				recordedVerifiedRefillDays: null
			}
		]
	});
	expect(result?.providers[1]).toMatchObject({
		balance: null,
		balanceCheckedAt: null,
		enabled: null,
		services: [{ state: 'paused' }]
	});
	expect(JSON.stringify(result)).not.toContain('must-not-leak');
	expect(db.boostCustomerOffer.findFirst).toHaveBeenCalledWith(
		expect.objectContaining({
			where: { id: 'offer', category: { categoryType: 'boosting_service' } }
		})
	);
});
it('exposes recorded refill verification only when both the signal and period are present', async () => {
	const verified = route('smm_raja', 'enabled');
	verified.verifiedSignals = ['refill_verified'];
	db.boostCustomerOffer.findFirst.mockResolvedValue({ id: 'offer', routes: [verified] });
	expect(
		(await loadBoostSupplierDetails('offer', db as never))?.providers[0].services[0]
			.recordedVerifiedRefillDays
	).toBe(30);
});
it('does not invent a route or query balances when the offer does not exist', async () => {
	db.boostCustomerOffer.findFirst.mockResolvedValue(null);
	expect(await loadBoostSupplierDetails('missing', db as never)).toBeNull();
	expect(db.boostProviderState.findMany).not.toHaveBeenCalled();
});
