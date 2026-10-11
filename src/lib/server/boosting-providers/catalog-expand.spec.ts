import { expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/prisma', () => ({ prisma: {} }));
import { prepopulateBoostingDraftSuggestions } from './draft-suggestions';

function database(outcome = 'likes', existing = false) {
	const category = {
		id: 'category',
		name: `TikTok ${outcome}`,
		categoryType: 'boosting_service',
		isActive: false,
		metadata: {
			boosting_platform: 'tiktok',
			boosting_action_type: outcome,
			boosting_min_quantity: 100,
			boosting_step_quantity: 100,
			boosting_price_per_step: 0
		}
	};
	const offers: any[] = existing
		? [
				{
					id: 'manual',
					categoryId: 'category',
					qualityTier: 'premium',
					audienceTag: 'general',
					status: 'hidden',
					pricePerStepNgn: 0,
					routes: [],
					_count: { routes: 0 }
				}
			]
		: [];
	const services = [0.1, 0.2].map((rate, index) => ({
		id: `supplier-${index}`,
		provider: index ? 'bulk_follows' : 'smm_raja',
		name: `TikTok ${outcome} [Refill]`,
		category: `TikTok ${outcome}`,
		platforms: ['tiktok'],
		outcomes: [outcome],
		providerType: 'Default',
		targetType: outcome === 'followers' ? 'profile' : 'content',
		ratePerThousand: rate,
		minQuantity: 10,
		maxQuantity: 100000,
		qualitySignals: ['stability_claim', 'refill_claim']
	}));
	const tx = {
		$executeRaw: vi.fn(),
		$queryRaw: vi.fn(),
		category: {
			findMany: vi.fn().mockResolvedValue([category]),
			createMany: vi.fn().mockResolvedValue({ count: 0 })
		},
		boostProviderService: { findMany: vi.fn().mockResolvedValue(services) },
		boostCustomerOffer: {
			findMany: vi.fn(async () => offers),
			createMany: vi.fn(async ({ data }: any) => {
				offers.push(...data.map((o: any) => ({ ...o, routes: [], _count: { routes: 0 } })));
				return { count: data.length };
			}),
			update: vi.fn()
		},
		boostServiceRoute: { createMany: vi.fn(async ({ data }: any) => ({ count: data.length })) },
		adminAuditLog: { createMany: vi.fn() }
	};
	const db = {
		...tx,
		$transaction: vi.fn(async (work: (t: typeof tx) => Promise<unknown>) => work(tx))
	};
	return { db, tx, offers };
}
it('expands in one serialized transaction and creates only hidden, unapproved routes', async () => {
	const { db, tx } = database();
	const result = await prepopulateBoostingDraftSuggestions({
		database: db as never,
		appendOnly: true
	});
	expect(result.offersCreated).toBe(1);
	expect(db.$transaction).toHaveBeenCalledOnce();
	expect(tx.$queryRaw).toHaveBeenCalledOnce();
	expect(
		tx.boostCustomerOffer.createMany.mock.calls[0][0].data.every((o: any) => o.status === 'hidden')
	).toBe(true);
	expect(
		tx.boostServiceRoute.createMany.mock.calls[0][0].data.every(
			(r: any) => r.state === 'shadow' && r.equivalenceApproved === false
		)
	).toBe(true);
	expect(tx.boostCustomerOffer.update).not.toHaveBeenCalled();
});
it('is idempotent and does not repair or replace an existing manually configured hidden offer', async () => {
	const { db, tx } = database('likes', true);
	expect(
		(await prepopulateBoostingDraftSuggestions({ database: db as never, appendOnly: true }))
			.offersCreated
	).toBe(0);
	expect(tx.boostCustomerOffer.update).not.toHaveBeenCalled();
	expect(tx.boostServiceRoute.createMany).not.toHaveBeenCalled();
	expect(tx.boostCustomerOffer.createMany).not.toHaveBeenCalled();
});
it('adds no more than two follower options and does not duplicate offers on a second expansion', async () => {
	const { db, offers, tx } = database('followers');
	await prepopulateBoostingDraftSuggestions({ database: db as never, appendOnly: true });
	expect(offers.length).toBeLessThanOrEqual(2);
	expect(offers.length).toBeGreaterThan(0);
	const count = offers.length;
	await prepopulateBoostingDraftSuggestions({ database: db as never, appendOnly: true });
	expect(offers).toHaveLength(count);
	expect(tx.boostCustomerOffer.update).not.toHaveBeenCalled();
});
