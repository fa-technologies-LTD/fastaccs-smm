import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
	phoneAttempt: { findMany: vi.fn() },
	phoneRental: { count: vi.fn() },
	phoneCatalogProbe: {
		updateMany: vi.fn(),
		findFirst: vi.fn(),
		upsert: vi.fn(),
		update: vi.fn(),
		groupBy: vi.fn(),
		findMany: vi.fn()
	},
	phoneCatalogProbeAttempt: {
		count: vi.fn(),
		findFirst: vi.fn(),
		create: vi.fn()
	},
	$transaction: vi.fn()
}));

const pvapinsMock = vi.hoisted(() => ({
	isPvapinsConfigured: vi.fn(),
	loadCountries: vi.fn(),
	loadApps: vi.fn(),
	rentNumber: vi.fn(),
	rejectNumber: vi.fn(),
	usdStringToCents: vi.fn(() => 66)
}));
const acquireRateTokenMock = vi.hoisted(() => vi.fn());
const alertMock = vi.hoisted(() => vi.fn());

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('./pvapins', () => pvapinsMock);
vi.mock('./admin-alerts', () => ({ sendCriticalAdminAlert: alertMock }));
vi.mock('./phone-pricing', () => ({
	getPhonePricingConfig: vi.fn(async () => ({ pvapinsRateLimitPerMin: 5 }))
}));
vi.mock('./phone-catalog', () => ({
	MAJOR_SERVICES: [{ id: 507, name: 'Signal' }],
	PVAPINS_EXPANSION_SERVICE_IDS: new Set([507]),
	PVAPINS_ONLY_MARKET_CODES: new Set(['US'])
}));
vi.mock('./number-providers/service-map', () => ({
	findPvapinsCountry: (countries: unknown[]) => countries[0] ?? null,
	pvapinsAppsForService: (_prefixes: string[], apps: unknown[]) => apps,
	serviceByHubId: () => ({ pvapinsPrefixes: ['Signal'] })
}));
vi.mock('./number-providers/pvapins-provider', () => ({
	decodePvapinsRef: (providerRef: string) => {
		const [number, country, app] = providerRef.split('|');
		return { number, country, app };
	},
	encodePvapinsRef: (number: string, country: string, app: string) => `${number}|${country}|${app}`
}));
vi.mock('./rate-limiter', () => ({
	acquireRateToken: acquireRateTokenMock,
	pvapinsRateSpec: () => ({ capacity: 5, refillPerSec: 5 / 60 }),
	PVAPINS_GET_NUMBER_BUCKET: 'pvapins:get_number'
}));

import { runPhoneCatalogProbe } from './phone-catalog-probe';

const candidate = {
	id: 'probe-1',
	serviceId: 507,
	serviceName: 'Signal',
	providerServiceRef: 'Signal2',
	countryId: 1,
	countryName: 'USA'
};

beforeEach(() => {
	vi.clearAllMocks();
	prismaMock.phoneCatalogProbe.findFirst.mockReset();
	pvapinsMock.isPvapinsConfigured.mockReturnValue(true);
	pvapinsMock.loadCountries.mockResolvedValue([{ id: 1, full_name: 'USA' }]);
	pvapinsMock.loadApps.mockResolvedValue([
		{ id: 2, full_name: 'Signal2', deduct: '0.66', trending: 0 }
	]);
	pvapinsMock.rentNumber.mockResolvedValue('15551234567');
	pvapinsMock.rejectNumber.mockResolvedValue(true);
	acquireRateTokenMock.mockResolvedValue(true);
	alertMock.mockResolvedValue({ sent: true });

	prismaMock.phoneAttempt.findMany.mockResolvedValue([]);
	prismaMock.phoneCatalogProbe.updateMany.mockResolvedValue({ count: 0 });
	prismaMock.phoneRental.count.mockResolvedValue(0);
	prismaMock.phoneCatalogProbe.findFirst
		.mockResolvedValueOnce(null)
		.mockResolvedValueOnce(candidate);
	prismaMock.phoneCatalogProbe.upsert.mockResolvedValue(candidate);
	prismaMock.phoneCatalogProbe.update.mockResolvedValue(candidate);
	prismaMock.phoneCatalogProbeAttempt.count.mockResolvedValue(0);
	prismaMock.phoneCatalogProbeAttempt.findFirst.mockResolvedValue(null);
	prismaMock.phoneCatalogProbeAttempt.create.mockResolvedValue({ id: 'attempt-1' });
	prismaMock.$transaction.mockImplementation(async (operations: Array<Promise<unknown>>) =>
		Promise.all(operations)
	);
});

describe('controlled phone catalogue probes', () => {
	it('uses one rent, confirms release, and records rentable evidence without publishing', async () => {
		const result = await runPhoneCatalogProbe();

		expect(result).toEqual(expect.objectContaining({ outcome: 'rentable_released' }));
		expect(pvapinsMock.rentNumber).toHaveBeenCalledTimes(1);
		expect(pvapinsMock.rejectNumber).toHaveBeenCalledTimes(1);
		expect(prismaMock.phoneCatalogProbe.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: 'probe-1' },
				data: expect.objectContaining({ status: 'rentable', releaseConfirmed: true })
			})
		);
		expect(prismaMock.phoneCatalogProbeAttempt.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ outcome: 'rentable_released', releaseConfirmed: true })
			})
		);
		expect(alertMock).not.toHaveBeenCalled();
	});

	it('rechecks buyer demand after slow catalogue discovery and yields before renting', async () => {
		prismaMock.phoneRental.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

		const result = await runPhoneCatalogProbe();

		expect(result).toEqual(
			expect.objectContaining({
				skipped: 'buyer_fulfillment_started_during_discovery',
				activeBuyerRentals: 1
			})
		);
		expect(pvapinsMock.rentNumber).not.toHaveBeenCalled();
		expect(acquireRateTokenMock).not.toHaveBeenCalled();
	});

	it('enforces the daily cap before supplier discovery or rent calls', async () => {
		prismaMock.phoneCatalogProbeAttempt.count.mockResolvedValue(8);

		const result = await runPhoneCatalogProbe();

		expect(result).toEqual(expect.objectContaining({ skipped: 'daily_cap', probesToday: 8 }));
		expect(pvapinsMock.loadCountries).not.toHaveBeenCalled();
		expect(pvapinsMock.rentNumber).not.toHaveBeenCalled();
	});

	it('pauses all future probes and alerts when release is not confirmed', async () => {
		pvapinsMock.rejectNumber.mockResolvedValue(false);

		const result = await runPhoneCatalogProbe();

		expect(result).toEqual(expect.objectContaining({ outcome: 'rentable_release_failed' }));
		expect(prismaMock.phoneCatalogProbe.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'release_failed',
					releaseConfirmed: false,
					nextProbeAt: null
				})
			})
		);
		expect(alertMock).toHaveBeenCalledWith(
			expect.objectContaining({ source: 'phone-catalog-probe' })
		);
	});

	it('treats an exception after rent as an unresolved hold, not an ordinary failed candidate', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		pvapinsMock.rejectNumber.mockRejectedValue(new Error('release endpoint failed'));

		const result = await runPhoneCatalogProbe();

		expect(result).toEqual(expect.objectContaining({ outcome: 'error_after_rent' }));
		expect(prismaMock.phoneCatalogProbe.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'release_failed',
					releaseConfirmed: false,
					nextProbeAt: null
				})
			})
		);
		expect(alertMock).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});
