import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { BoostMappingSaveInput } from '$lib/helpers/boosting-mapping-types';
import { BoostMappingError, saveBoostMappingWorkspace } from './mapping-workspace';

const categoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const serviceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

function database(refillAdvertised = true) {
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
				findMany: vi.fn().mockResolvedValue([
					{
						id: serviceId,
						unavailableAt: null,
						catalogueStatus: 'ready_for_review',
						platforms: ['instagram'],
						outcomes: ['followers'],
						targetType: 'profile',
						minQuantity: 100,
						maxQuantity: 100000,
						refillAdvertised
					}
				])
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

	it('rejects a cost ceiling that can consume the entire customer price', async () => {
		const input = validInput();
		input.offer.maximumSupplierCostNgn = 5000;
		await expect(
			saveBoostMappingWorkspace(categoryId, input, 'admin-1', { database: database().client })
		).rejects.toThrow('maximum cost must stay below the customer price');
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
				database: database(false).client
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
