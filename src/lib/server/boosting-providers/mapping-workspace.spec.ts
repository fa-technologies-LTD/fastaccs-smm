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

function providerService(
	id = serviceId,
	ratePerThousand = 1,
	refillAdvertised = true
) {
	return {
		id,
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

function database(refillAdvertised = true, services = [providerService(serviceId, 1, refillAdvertised)]) {
	const offerUpsert = vi.fn().mockResolvedValue({ id: 'offer-1' });
	const routeUpsert = vi.fn().mockResolvedValue({ id: 'route-1' });
	const offerUpdate = vi.fn().mockResolvedValue({});
	const routeUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
	const auditCreate = vi.fn().mockResolvedValue({});
	const tx = {
		boostCustomerOffer: { upsert: offerUpsert, update: offerUpdate },
		boostServiceRoute: { upsert: routeUpsert, updateMany: routeUpdateMany },
		adminAuditLog: { create: auditCreate }
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
			$transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx))
		} as unknown as PrismaClient,
		offerUpsert,
		routeUpsert,
		offerUpdate,
		auditCreate
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

	it('rejects a cost ceiling above the entire customer price', async () => {
		const input = validInput();
		input.offer.maximumSupplierCostNgn = 5001;
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow('customer price is too low');
	});

	it('requires a fresh promise check when an approved route is upgraded to premium', async () => {
		const input = validInput();
		input.offer.qualityTier = 'premium';
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow('Recheck each mapped route');
	});

	it('rejects a refill offer when the current supplier row no longer supports refill', async () => {
		await expect(
			saveBoostMappingWorkspace(categoryId, validInput(), 'admin-1', {
				database: database(false, [
					{
						...providerService(serviceId, 1, false),
						name: 'Instagram Followers - NO REFILL'
					}
				]).client
			})
		).rejects.toThrow('not safely compatible');
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
		const db = database(true, [providerService(serviceId, 2), providerService(fallbackServiceId, 1)]);
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
});
