import { beforeEach, expect, it, vi } from 'vitest';
import { saleOfferFixture } from '../boosting-sale-readiness-fixtures';
import {
	loadBoostSupplierChoices,
	supplierChoice,
	supplierChoiceRevision,
	type ChoiceService
} from './supplier-choice';
vi.mock('$env/dynamic/private', () => ({ env: {} }));
const service = () => saleOfferFixture().routes[0].providerService as ChoiceService;
it('lists current cost, limits and advertised refill without certifying claims', () => {
	const row = service();
	Object.assign(row, { name: 'TikTok Likes refill 30 days', refillAdvertised: true });
	expect(supplierChoice(row, { platform: 'tiktok', outcome: 'likes' })).toMatchObject({
		rateUsd: 0.1,
		min: 100,
		max: 10000,
		issues: [],
		refillAdvertised: true,
		refillDaysClaimed: 30
	});
});
it('versions price/limits and identity but not routine unchanged refresh timestamps', () => {
	const row = service(),
		original = supplierChoiceRevision(row);
	row.lastSeenAt = new Date(Date.now() + 1000);
	expect(supplierChoiceRevision(row)).toBe(original);
	row.maxQuantity = 999;
	expect(supplierChoiceRevision(row)).not.toBe(original);
});
it.each(['platform', 'result', 'inputs', 'unavailable', 'stale', 'price', 'limits'])(
	'reports incompatible %s explicitly',
	(kind) => {
		const row = service();
		if (kind === 'platform') row.platforms = ['facebook'];
		if (kind === 'result') row.outcomes = ['followers'];
		if (kind === 'inputs') row.providerType = 'Subscriptions';
		if (kind === 'unavailable') row.unavailableAt = new Date();
		if (kind === 'stale') row.lastSeenAt = new Date(Date.now() - 400 * 60000);
		if (kind === 'price') row.ratePerThousand = null;
		if (kind === 'limits') row.minQuantity = null;
		expect(
			supplierChoice(row, { platform: 'tiktok', outcome: 'likes' }).issues.length
		).toBeGreaterThan(0);
	}
);
it('keeps account readiness distinct from whether a service can be saved as an offline draft', () => {
	const row = service();
	row.providerState!.enabled = false;
	const choice = supplierChoice(row, { platform: 'tiktok', outcome: 'likes' });
	expect(choice.issues).toEqual([]);
	expect(choice.publicationIssues).toContain(
		'The supplier account is paused or its currency is unsupported.'
	);
});
it('supports an exact prefixed code and reports mismatches instead of silently substituting a different result', async () => {
	const row = service();
	row.platforms = ['facebook'];
	const findMany = vi.fn().mockResolvedValue([row]);
	const result = await loadBoostSupplierChoices(
		{ platform: 'tiktok', outcome: 'likes' },
		{ provider: 'smm_raja', search: '#S4975' },
		{ boostProviderService: { findMany } } as never
	);
	expect(findMany).toHaveBeenCalledWith(
		expect.objectContaining({ where: { provider: 'smm_raja', serviceId: 's4975' }, take: 31 })
	);
	expect(result.services[0].issues).toContain('This service is for a different platform.');
});
it('bounds manual browsing and uses alphabetical ordering, not automatic supplier ranking', async () => {
	const findMany = vi.fn().mockResolvedValue(Array.from({ length: 31 }, () => service()));
	const result = await loadBoostSupplierChoices(
		{ platform: 'tiktok', outcome: 'likes' },
		{ search: 'Likes' },
		{ boostProviderService: { findMany } } as never
	);
	expect(result.services).toHaveLength(30);
	expect(result.hasMore).toBe(true);
	expect(findMany).toHaveBeenCalledWith(
		expect.objectContaining({ orderBy: [{ name: 'asc' }, { id: 'asc' }] })
	);
});
