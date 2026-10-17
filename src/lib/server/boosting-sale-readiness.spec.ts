import { describe, expect, it, vi } from 'vitest';
vi.mock('$env/dynamic/private', () => ({ env: {} }));
import { inspectBoostSale } from './boosting-sale-readiness';
import { saleOfferFixture } from './boosting-sale-readiness-fixtures';

describe('read-only sale refusal checks', () => {
	it('keeps the live sync window rather than inheriting the older shadow preview limits', () => {
		const offer = saleOfferFixture();
		const service = offer.routes[0].providerService;
		service.lastSeenAt = new Date(Date.now() - 120 * 60000);
		service.providerState.lastCatalogueSuccessAt = service.lastSeenAt;
		service.providerState.lastBalanceSuccessAt = new Date(Date.now() - 60 * 60000);
		expect(inspectBoostSale(offer, 1500).available).toBe(true);
	});
	it.each([
		['catalogue', 391, 'Supplier catalogue information needs refreshing.'],
		['balance', 391, 'Supplier balance information needs refreshing.']
	])(
		'refuses stale %s records before payment at the existing live fulfillment default',
		(kind, minutes, reason) => {
			const offer = saleOfferFixture();
			const stale = new Date(Date.now() - Number(minutes) * 60000);
			const service = offer.routes[0].providerService;
			if (kind === 'catalogue') {
				service.lastSeenAt = stale;
				service.providerState.lastCatalogueSuccessAt = stale;
			} else service.providerState.lastBalanceSuccessAt = stale;
			const result = inspectBoostSale(offer, 1500);
			expect(result.available).toBe(false);
			expect(result.reasons).toContain(reason);
		}
	);
	it('permits a valid recorded configuration without selecting or exposing a supplier', () => {
		const result = inspectBoostSale(saleOfferFixture(), 1500);
		expect(result).toMatchObject({ available: true, reasons: [], maximumQuantity: 10000 });
		expect(result).not.toHaveProperty('selectedRouteId');
	});
	it.each([
		['missing mapping', (o: any) => (o.routes = [])],
		['unapproved mapping', (o: any) => (o.routes[0].equivalenceApproved = false)],
		['paused mapping', (o: any) => (o.routes[0].state = 'paused')],
		['locked mapping absent', (o: any) => (o.lockedRouteId = 'missing')],
		['provider disabled', (o: any) => (o.routes[0].providerService.providerState.enabled = false)],
		['provider paused', (o: any) => (o.routes[0].providerService.providerState.circuitOpen = true)],
		['unsupported provider', (o: any) => (o.routes[0].providerService.provider = 'unknown')],
		[
			'missing spendable balance despite a historic raw balance',
			(o: any) => (o.routes[0].providerService.providerState.projectedBalance = null)
		],
		[
			'unsupported currency',
			(o: any) => (o.routes[0].providerService.providerState.currency = 'NGN')
		],
		[
			'missing balance',
			(o: any) => {
				o.routes[0].providerService.providerState.balance = null;
				o.routes[0].providerService.providerState.projectedBalance = null;
			}
		],
		[
			'insufficient balance',
			(o: any) => (o.routes[0].providerService.providerState.projectedBalance = 5)
		],
		[
			'stale balance',
			(o: any) => (o.routes[0].providerService.providerState.lastBalanceSuccessAt = new Date(0))
		],
		[
			'missing catalogue date',
			(o: any) => (o.routes[0].providerService.providerState.lastCatalogueSuccessAt = null)
		],
		['stale service date', (o: any) => (o.routes[0].providerService.lastSeenAt = new Date(0))],
		[
			'future timestamp',
			(o: any) => (o.routes[0].providerService.lastSeenAt = new Date(Date.now() + 60000))
		],
		['unavailable service', (o: any) => (o.routes[0].providerService.unavailableAt = new Date())],
		[
			'quarantined service',
			(o: any) => (o.routes[0].providerService.catalogueStatus = 'quarantined')
		],
		['wrong target', (o: any) => (o.routes[0].providerService.targetType = 'profile')],
		['wrong result', (o: any) => (o.routes[0].providerService.outcomes = ['followers'])],
		['supplier minimum', (o: any) => (o.routes[0].providerService.minQuantity = 1000)],
		['supplier maximum', (o: any) => (o.routes[0].maximumQuantity = 200)],
		['missing promise evidence', (o: any) => (o.requiredVerifiedSignals = ['verified-delivery'])],
		[
			'advertised refill only',
			(o: any) => {
				o.refillDays = 30;
				o.routes[0].providerService.refillAdvertised = true;
			}
		],
		['wrong audience', (o: any) => (o.audienceTag = 'nigeria')],
		['known poor delivery record', (o: any) => (o.routes[0].reliabilityScore = 0.1)],
		['cost over reviewed limit', (o: any) => (o.maximumSupplierCostNgn = 0.01)],
		['price below saved margin', (o: any) => (o.pricePerStepNgn = 1)],
		['hidden offer', (o: any) => (o.status = 'hidden')]
	])('refuses %s', (_, mutate) => {
		const offer = saleOfferFixture();
		mutate(offer);
		expect(inspectBoostSale(offer, 1500)).toMatchObject({
			available: false,
			reasons: expect.any(Array)
		});
	});
	it('rechecks the actual purchase quantity and discounted revenue', () => {
		const offer = saleOfferFixture();
		expect(inspectBoostSale(offer, 1500, 101).available).toBe(false);
		expect(inspectBoostSale(offer, 1500, 500, { customerPriceNgn: 1 }).available).toBe(false);
		offer.routes[0].providerService.providerState.projectedBalance = 5.1 as never;
		expect(inspectBoostSale(offer, 1500, 500).available).toBe(true);
		expect(inspectBoostSale(offer, 1500, 2000).available).toBe(false);
	});
});
