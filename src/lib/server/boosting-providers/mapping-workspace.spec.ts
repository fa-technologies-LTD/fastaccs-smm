import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { BoostMappingSaveInput } from '$lib/helpers/boosting-mapping-types';
import { BoostMappingError, saveBoostMappingWorkspace } from './mapping-workspace';

const categoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const serviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const fallbackServiceId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function validInput(): BoostMappingSaveInput {
	return {
		offer: {
			qualityTier: 'stable',
			customerName: 'More stable followers',
			shortPromise: 'Lower drop risk with a 30-day refill.',
			refillDays: 30,
			minQuantity: 1000,
			maxQuantity: null,
			stepQuantity: 1000,
			pricePerStepNgn: 5000,
			priceLocked: false,
			minimumMarginPercent: 30,
			normalCostTargetNgn: 1200,
			maximumSupplierCostNgn: 2500,
			attemptCap: 1,
			fallbackMode: 'none',
			status: 'reviewed',
			routingPolicy: 'automatic',
			preferredProviderServiceId: null,
			lockedProviderServiceId: null
		},
		routes: [
			{
				providerServiceId: serviceId,
				state: 'enabled',
				equivalenceApproved: true,
				verifiedSignals: ['stability_verified', 'refill_verified'],
				audienceTags: [],
				verifiedRefillDays: 30,
				maximumPilotQuantity: 1000,
				expectedRecoveryCostPercent: 5
			}
		]
	};
}

function providerService(id = serviceId, ratePerThousand = 1, refillAdvertised = true) {
	return {
		id,
		provider: 'smm_raja',
		serviceId: id,
		name: 'Instagram Followers - REFILL 30D',
		category: 'Instagram',
		description: null,
		unavailableAt: null,
		catalogueStatus: 'ready_for_review',
		platforms: ['instagram'],
		outcomes: ['followers'],
		targetType: 'profile',
		minQuantity: 100,
		maxQuantity: 100000,
		ratePerThousand,
		refillAdvertised
	};
}

function database(
	refillAdvertised = true,
	services = [providerService(serviceId, 1, refillAdvertised)]
) {
	const offerUpsert = vi.fn().mockResolvedValue({ id: 'offer-1' });
	const routeUpsert = vi.fn().mockResolvedValue({ id: 'route-1' });
	const offerUpdate = vi.fn().mockResolvedValue({});
	const routeUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
	const auditCreate = vi.fn().mockResolvedValue({});
	const categoryUpdate = vi.fn().mockResolvedValue({});
	const rolloutUpsert = vi.fn().mockResolvedValue({});
	const tx = {
		boostCustomerOffer: { upsert: offerUpsert, update: offerUpdate },
		boostServiceRoute: { upsert: routeUpsert, updateMany: routeUpdateMany },
		adminAuditLog: { create: auditCreate },
		category: { update: categoryUpdate },
		microcopy: { upsert: rolloutUpsert }
	};
	return {
		client: {
			category: {
				findFirst: vi.fn().mockResolvedValue({
					id: categoryId,
					metadata: {
						boosting_platform: 'instagram',
						boosting_action_type: 'followers',
						boosting_min_quantity: 1000,
						boosting_step_quantity: 1000,
						boosting_price_per_step: 5000,
						boosting_refill_available: true,
						boosting_refill_days: 30
					}
				})
			},
			boostProviderService: {
				findMany: vi.fn().mockResolvedValue(services)
			},
			microcopy: {
				findMany: vi
					.fn()
					.mockResolvedValue([{ key: 'config.boosting.usd_ngn_rate', value: '1700' }])
			},
			$transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx))
		} as unknown as PrismaClient,
		offerUpsert,
		routeUpsert,
		offerUpdate,
		auditCreate,
		categoryUpdate,
		rolloutUpsert
	};
}

describe('boosting mapping workspace persistence', () => {
	it('rejects enabling a supplier route before its promise is checked', async () => {
		const input = validInput();
		input.routes[0].equivalenceApproved = false;
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toBeInstanceOf(BoostMappingError);
	});

	it('rejects a customer price that misses the configured profit target', async () => {
		const input = validInput();
		input.offer.pricePerStepNgn = 2000;
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow('customer price is too low');
	});

	it('checks margin against the same rounded price the customer will actually pay', async () => {
		const input = validInput();
		input.offer.minQuantity = 100;
		input.offer.stepQuantity = 300;
		input.offer.pricePerStepNgn = 500;
		input.offer.minimumMarginPercent = 0;

		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', {
				database: database(true, [providerService(serviceId, 0.941176)]).client
			})
		).rejects.toThrow('customer price is too low');
	});

	it('persists an admin-adjusted per-option starting quantity and increment', async () => {
		const db = database();
		const input = validInput();
		input.offer.minQuantity = 500;
		input.offer.stepQuantity = 100;

		await saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: db.client });
		expect(db.offerUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					minQuantity: 500,
					stepQuantity: 100,
					quantityPresets: [500, 1000, 2500, 5000]
				})
			})
		);
	});

	it('ignores an echoed browser maximum and derives it from the selected supplier services', async () => {
		const providerMaximum = 100_000_000;
		const db = database(true, [{ ...providerService(), maxQuantity: providerMaximum }]);
		const input = validInput();
		input.offer.maxQuantity = providerMaximum;

		await saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: db.client });
		expect(db.offerUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ maxQuantity: providerMaximum }),
				update: expect.objectContaining({ maxQuantity: providerMaximum })
			})
		);
	});

	it('rejects an offer starting below a selected supplier minimum', async () => {
		const input = validInput();
		input.offer.minQuantity = 50;

		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow('outside the selected primary supplier range');
	});

	it('requires a fresh promise check when an approved route is upgraded to premium', async () => {
		const input = validInput();
		input.offer.qualityTier = 'premium';
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow(
			'SMM Raja #bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb is missing premium-quality evidence'
		);
	});

	it('accepts owner-tested refill evidence when the supplier listing does not advertise it', async () => {
		const db = database(false, [
			{
				...providerService(serviceId, 1, false),
				name: 'Instagram Followers'
			}
		]);

		await saveBoostMappingWorkspace(categoryId, validInput(), 'admin-1', {
			database: db.client
		});

		expect(db.routeUpsert).toHaveBeenCalled();
	});

	it('does not mark an offer reviewed without one promise-checked route', async () => {
		const input = validInput();
		input.routes = [];
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow('Keep this offer hidden');
	});

	it('keeps a reviewed, promise-checked route in true shadow mode', async () => {
		const db = database();
		const input = validInput();
		input.routes[0].state = 'shadow';

		await saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: db.client });
		expect(db.routeUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ state: 'shadow', equivalenceApproved: true })
			})
		);
	});

	it('allows a known service to be locked for shadow simulation without pilot-enabling it', async () => {
		const db = database();
		const input = validInput();
		input.offer.routingPolicy = 'locked';
		input.offer.lockedProviderServiceId = serviceId;
		input.routes[0].state = 'shadow';

		await saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: db.client });
		expect(db.routeUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ state: 'shadow', equivalenceApproved: true })
			})
		);
		expect(db.offerUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ lockedRouteId: 'route-1' })
			})
		);
	});

	it('persists a manually chosen fallback and the definitive-rejection retry rule', async () => {
		const db = database(true, [
			providerService(serviceId, 2),
			providerService(fallbackServiceId, 1)
		]);
		const input = validInput();
		input.offer.routingPolicy = 'preferred';
		input.offer.preferredProviderServiceId = serviceId;
		input.offer.fallbackMode = 'manual';
		input.offer.attemptCap = 2;
		input.routes.push({ ...input.routes[0], providerServiceId: fallbackServiceId });

		await saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: db.client });
		expect(db.offerUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					recoveryModes: ['retry_definitive_failure', 'fallback_manual']
				})
			})
		);
	});

	it('rejects a fallback that costs more than its primary service', async () => {
		const input = validInput();
		input.offer.routingPolicy = 'preferred';
		input.offer.preferredProviderServiceId = serviceId;
		input.offer.fallbackMode = 'manual';
		input.offer.attemptCap = 2;
		input.routes.push({ ...input.routes[0], providerServiceId: fallbackServiceId });

		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', {
				database: database(true, [
					providerService(serviceId, 1),
					providerService(fallbackServiceId, 2)
				]).client
			})
		).rejects.toThrow('fallback must cost the same');
	});

	it('requires a quantity cap before a checked route can be pilot enabled', async () => {
		const input = validInput();
		input.routes[0].maximumPilotQuantity = null;
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow('Set a pilot quantity limit');
	});

	it('derives the customer promise envelope and audits a safe internal mapping', async () => {
		const db = database();
		await saveBoostMappingWorkspace(categoryId, validInput(), 'admin-1', {
			database: db.client
		});

		expect(db.offerUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					platform: 'instagram',
					outcome: 'followers',
					targetType: 'profile',
					expectationChips: ['30-day refill protection'],
					requiredVerifiedSignals: ['refill_verified', 'stability_verified'],
					status: 'reviewed'
				})
			})
		);
		expect(db.routeUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({
					providerServiceId: serviceId,
					equivalenceApproved: true,
					equivalenceLabel: 'Owner reviewed in Boosting Setup',
					reviewedByUserId: 'admin-1'
				})
			})
		);
		expect(db.auditCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ action: 'boosting_mapping_saved' })
			})
		);
	});

	it('activates the category and permanently cuts over only when an offer is made live', async () => {
		const db = database();
		const input = validInput();
		input.offer.status = 'live';

		await saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: db.client });

		expect(db.categoryUpdate).toHaveBeenCalledWith({
			where: { id: categoryId },
			data: { isActive: true }
		});
		expect(db.rolloutUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { key: 'config.boosting.managed_storefront_enabled' },
				update: { value: 'true', isActive: true }
			})
		);
	});
});
