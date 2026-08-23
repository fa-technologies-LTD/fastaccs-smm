import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	phoneRental: { findMany: vi.fn() },
	phoneAttempt: { findMany: vi.fn() },
	analyticsEvent: { findMany: vi.fn() }
}));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(),
	NUMBERS_CLEAN_EPOCH: new Date('2000-01-01T00:00:00Z')
}));
vi.mock('./hubman', () => ({ getBalanceCents: vi.fn(), isHubmanConfigured: () => false }));

import {
	getRealizedCostByTier,
	getLowSuccessTierKeys,
	summarizeNumbersDemand
} from './phone-analytics';

beforeEach(() => {
	vi.clearAllMocks();
	rowId = 0;
	prismaMock.phoneAttempt.findMany.mockResolvedValue([]);
	prismaMock.analyticsEvent.findMany.mockResolvedValue([]);
});

let rowId = 0;
// Build tier rows plus resolved attempt outcomes for one provider.
function outcomes(
	serviceName: string,
	countryName: string,
	provider: string,
	received: number,
	failed: number
) {
	const rentals: Array<{ orderItemId: string; serviceName: string; countryName: string }> = [];
	const attempts: Array<{ orderItemId: string; provider: string; outcome: string }> = [];
	for (let i = 0; i < received + failed; i++) {
		const orderItemId = `item-${++rowId}`;
		rentals.push({ orderItemId, serviceName, countryName });
		attempts.push({
			orderItemId,
			provider,
			outcome: i < received ? 'otp_received' : 'otp_timeout'
		});
	}
	return { rentals, attempts };
}

function mockOutcomes(...sets: ReturnType<typeof outcomes>[]) {
	prismaMock.phoneRental.findMany.mockResolvedValue(sets.flatMap((s) => s.rentals));
	prismaMock.phoneAttempt.findMany.mockResolvedValue(sets.flatMap((s) => s.attempts));
}

describe('getLowSuccessTierKeys — provider-aware, two-supplier safe', () => {
	it('does NOT hide when failures are split across two under-sampled providers', () => {
		// The real USA WhatsApp case: hub-man 0/7, pvapins 2/3 — neither hits MIN_SAMPLE (10),
		// so both are "untested" and the tier stays live (the old code summed them and hid it).
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 0, 7),
			outcomes('WhatsApp', 'USA', 'pvapins', 2, 1)
		);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(false));
	});

	it('does NOT hide when one supplier is proven-bad but the other is proven-good', () => {
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 0, 20), // BAD (0%)
			outcomes('WhatsApp', 'USA', 'pvapins', 18, 2) // GOOD (90%)
		);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(false));
	});

	it('does NOT hide when one supplier is proven-bad but the other is untested', () => {
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 0, 20), // BAD
			outcomes('WhatsApp', 'USA', 'pvapins', 3, 1) // untested (< MIN_SAMPLE)
		);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(false));
	});

	it('does NOT hide when one supplier is proven-bad but the other has no outcomes yet', () => {
		mockOutcomes(outcomes('WhatsApp', 'USA', 'hubman', 0, 20));
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(false));
	});

	it('hides ONLY when every sampled supplier is proven-bad', () => {
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 1, 19), // 5% BAD
			outcomes('WhatsApp', 'USA', 'pvapins', 2, 18) // 10% BAD
		);
		return getLowSuccessTierKeys().then((set) => expect(set.has('WhatsApp||USA')).toBe(true));
	});

	it('reads only the recent window (passes a createdAt lower bound)', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([]);
		return getLowSuccessTierKeys().then(() => {
			const arg = prismaMock.phoneRental.findMany.mock.calls[0][0];
			expect(arg.where.createdAt.gte).toBeInstanceOf(Date);
		});
	});
});

describe('getRealizedCostByTier — robust median per tier', () => {
	it('keys by serviceId||countryId and takes the median cost, skipping bad rows', () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			{ orderItemId: 'a', serviceId: 1, countryId: 58, costCents: 60 },
			{ orderItemId: 'b', serviceId: 1, countryId: 58, costCents: 40 },
			{ orderItemId: 'c', serviceId: 1, countryId: 58, costCents: 50 },
			{ orderItemId: 'd', serviceId: 1, countryId: 58, costCents: null }, // skipped
			{ orderItemId: 'e', serviceId: 2, countryId: 7, costCents: 200 }
		]);
		prismaMock.phoneAttempt.findMany.mockResolvedValue([]); // historical fallback
		return getRealizedCostByTier().then((map) => {
			expect(map.get('1||58')).toEqual({ medianCents: 50, count: 3 });
			expect(map.get('2||7')).toEqual({ medianCents: 200, count: 1 });
		});
	});

	it('sums all charged attempts on a successful order (true fulfillment cost)', async () => {
		prismaMock.phoneRental.findMany.mockResolvedValue([
			{ orderItemId: 'a', serviceId: 1, countryId: 58, costCents: 40 }
		]);
		prismaMock.phoneAttempt.findMany.mockResolvedValue([
			{ orderItemId: 'a', actualCostCents: 30 },
			{ orderItemId: 'a', actualCostCents: 40 }
		]);
		const map = await getRealizedCostByTier();
		expect(map.get('1||58')).toEqual({ medianCents: 70, count: 1 });
	});
});

describe('summarizeNumbersDemand', () => {
	it('keeps opens, paid rental starts, and delivered codes as separate evidence', () => {
		expect(
			summarizeNumbersDemand(
				[
					{ serviceId: 507, serviceName: 'Signal', status: 'received' },
					{ serviceId: 507, serviceName: 'Signal', status: 'refunded' },
					{ serviceId: 1, serviceName: 'WhatsApp', status: 'received' }
				],
				[
					{ path: '/numbers/service/507' },
					{ path: '/numbers/service/507' },
					{ path: '/numbers/service/1' },
					{ path: '/numbers/not-a-service' }
				]
			)
		).toEqual([
			{ serviceId: 507, serviceName: 'Signal', opens: 2, purchases: 2, deliveries: 1 },
			{ serviceId: 1, serviceName: 'WhatsApp', opens: 1, purchases: 1, deliveries: 1 }
		]);
	});
});
