import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	phoneRental: { findMany: vi.fn() },
	phoneAttempt: { findMany: vi.fn() },
	phoneSupplierCatalogScope: { findMany: vi.fn() },
	phoneSupplierCatalogRoute: { findMany: vi.fn() },
	category: { findMany: vi.fn() },
	analyticsEvent: { findMany: vi.fn() }
}));
const getPhonePricingConfigMock = vi.hoisted(() => vi.fn());
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: getPhonePricingConfigMock,
	computeProcurementCeilingCents: (saleNgn: number, floorNgn: number, rate: number) =>
		Math.max(0, Math.floor(((saleNgn - floorNgn) / rate) * 100)),
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
	prismaMock.phoneSupplierCatalogScope.findMany.mockResolvedValue([]);
	prismaMock.phoneSupplierCatalogRoute.findMany.mockResolvedValue([]);
	prismaMock.category.findMany.mockResolvedValue([]);
	prismaMock.analyticsEvent.findMany.mockResolvedValue([]);
	getPhonePricingConfigMock.mockResolvedValue({
		usdNgnRate: 1700,
		minFulfillmentProfitNgn: 500
	});
});

let rowId = 0;
// Build tier rows plus resolved attempt outcomes for one provider.
function outcomes(
	serviceName: string,
	countryName: string,
	provider: string,
	received: number,
	failed: number,
	providerServiceRef = `${provider}-route`
) {
	const rentals: Array<{
		orderItemId: string;
		serviceId: number;
		serviceName: string;
		countryId: number;
		countryName: string;
		status: string;
		createdAt: Date;
		receivedAt: Date | null;
		refundedAt: Date | null;
		updatedAt: Date;
	}> = [];
	const attempts: Array<{
		orderItemId: string;
		provider: string;
		providerServiceRef: string;
		outcome: string;
		createdAt: Date;
		updatedAt: Date;
	}> = [];
	for (let i = 0; i < received + failed; i++) {
		const orderItemId = `item-${++rowId}`;
		const at = new Date(Date.now() - (received + failed - i) * 1_000);
		const delivered = i < received;
		rentals.push({
			orderItemId,
			serviceId: 1,
			serviceName,
			countryId: 58,
			countryName,
			status: delivered ? 'received' : 'refunded',
			createdAt: at,
			receivedAt: delivered ? at : null,
			refundedAt: delivered ? null : at,
			updatedAt: at
		});
		attempts.push({
			orderItemId,
			provider,
			providerServiceRef,
			outcome: delivered ? 'otp_received' : 'otp_timeout',
			createdAt: at,
			updatedAt: at
		});
	}
	return { rentals, attempts };
}

function mockOutcomes(...sets: ReturnType<typeof outcomes>[]) {
	prismaMock.phoneRental.findMany.mockResolvedValue(sets.flatMap((s) => s.rentals));
	prismaMock.phoneAttempt.findMany.mockResolvedValue(sets.flatMap((s) => s.attempts));
}

function mockCurrentSnapshot(
	routes: Array<{ routeKey: string; costCents: number }>,
	priceNgn = 1_800
) {
	prismaMock.phoneSupplierCatalogScope.findMany.mockResolvedValue([
		{ serviceId: 1, countryId: 58 }
	]);
	prismaMock.phoneSupplierCatalogRoute.findMany.mockResolvedValue(
		routes.map((route) => ({ ...route, serviceId: 1, countryId: 58 }))
	);
	prismaMock.category.findMany.mockResolvedValue([
		{
			metadata: {
				delivery_mode: 'auto_sms',
				hub_service_id: 1,
				hub_service_name: 'WhatsApp',
				hub_country_id: 58,
				hub_country_name: 'USA',
				hub_country_code: 'US',
				pricing: { base_price: priceNgn }
			}
		}
	]);
}

describe('getLowSuccessTierKeys — low-volume exact-route protection', () => {
	it('keeps a tier live after only one no-code outcome', async () => {
		mockOutcomes(outcomes('WhatsApp', 'USA', 'hubman', 0, 1, '1'));
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(false);
	});

	it('keeps a twice-failed route available only as a deprioritized fallback', async () => {
		mockOutcomes(outcomes('WhatsApp', 'USA', 'hubman', 0, 2, '1'));
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(false);
	});

	it('stays live when failures are split across alternatives that have not individually tripped', async () => {
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 0, 1, '1'),
			outcomes('WhatsApp', 'USA', 'pvapins', 0, 1, 'Whatsapp159')
		);
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(false);
	});

	it('keeps a tier live when another exact route is currently healthy', async () => {
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 0, 7, '1'),
			outcomes('WhatsApp', 'USA', 'pvapins', 2, 0, 'Whatsapp60')
		);
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(false);
	});

	it('hides only when every observed exact route is actively blocked', async () => {
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 0, 3, '1'),
			outcomes('WhatsApp', 'USA', 'pvapins', 0, 3, 'Whatsapp161')
		);
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(true);
	});

	it('keeps a tier live when the persisted catalogue contains an unexplored route', async () => {
		mockOutcomes(outcomes('WhatsApp', 'USA', 'hubman', 0, 3, '1'));
		mockCurrentSnapshot([
			{ routeKey: 'hubman:route:1:58:1', costCents: 50 },
			{ routeKey: 'pvapins:route:1:58:Whatsapp24', costCents: 66 }
		]);
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(false);
	});

	it('hides when every route in the current catalogue snapshot is actively blocked', async () => {
		mockOutcomes(
			outcomes('WhatsApp', 'USA', 'hubman', 0, 3, '1'),
			outcomes('WhatsApp', 'USA', 'pvapins', 0, 3, 'Whatsapp24')
		);
		mockCurrentSnapshot([
			{ routeKey: 'hubman:route:1:58:1', costCents: 50 },
			{ routeKey: 'pvapins:route:1:58:Whatsapp24', costCents: 66 }
		]);
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(true);
	});

	it('treats a successfully fetched empty supplier scope as no route, not as unknown', async () => {
		mockOutcomes(outcomes('WhatsApp', 'USA', 'hubman', 0, 3, '1'));
		mockCurrentSnapshot([]);
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(true);
	});

	it('does not let an unaffordable unexplored listing keep checkout open', async () => {
		mockOutcomes(outcomes('WhatsApp', 'USA', 'hubman', 0, 3, '1'));
		// ₦1,800 sale - ₦500 hard floor at ₦1,700/$ gives a 76-cent ceiling.
		mockCurrentSnapshot([
			{ routeKey: 'hubman:route:1:58:1', costCents: 50 },
			{ routeKey: 'pvapins:route:1:58:Whatsapp99', costCents: 100 }
		]);
		expect((await getLowSuccessTierKeys()).has('WhatsApp||USA')).toBe(true);
	});

	it('does not treat a completely new tier with no outcomes as unsafe', async () => {
		mockOutcomes();
		expect((await getLowSuccessTierKeys()).size).toBe(0);
	});

	it('temporarily hides a tier whose only observed supplier listing is repeatedly OOS', async () => {
		const now = new Date();
		prismaMock.phoneRental.findMany.mockResolvedValue([
			{
				orderItemId: 'dry-1',
				serviceId: 2,
				serviceName: 'Telegram',
				countryId: 58,
				countryName: 'USA',
				status: 'pending',
				createdAt: now,
				receivedAt: null,
				refundedAt: null,
				updatedAt: now
			},
			{
				orderItemId: 'dry-2',
				serviceId: 2,
				serviceName: 'Telegram',
				countryId: 58,
				countryName: 'USA',
				status: 'pending',
				createdAt: now,
				receivedAt: null,
				refundedAt: null,
				updatedAt: now
			}
		]);
		prismaMock.phoneAttempt.findMany.mockResolvedValue([
			{
				orderItemId: 'dry-1',
				provider: 'pvapins',
				providerServiceRef: 'Telegram2',
				outcome: 'oos',
				createdAt: new Date(now.getTime() - 2_000),
				updatedAt: new Date(now.getTime() - 2_000)
			},
			{
				orderItemId: 'dry-2',
				provider: 'pvapins',
				providerServiceRef: 'Telegram2',
				outcome: 'oos',
				createdAt: new Date(now.getTime() - 1_000),
				updatedAt: new Date(now.getTime() - 1_000)
			}
		]);
		expect((await getLowSuccessTierKeys()).has('Telegram||USA')).toBe(true);
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
