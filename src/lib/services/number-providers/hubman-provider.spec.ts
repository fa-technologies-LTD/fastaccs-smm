import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSmsMock = vi.hoisted(() => vi.fn());
const cancelRentMock = vi.hoisted(() => vi.fn());
const rentMock = vi.hoisted(() => vi.fn());

const { HubmanError } = vi.hoisted(() => {
	class HubmanError extends Error {
		status: number;
		body: unknown;
		constructor(message: string, status: number, body: unknown) {
			super(message);
			this.status = status;
			this.body = body;
		}
	}
	return { HubmanError };
});

vi.mock('../hubman', () => ({
	isHubmanConfigured: () => true,
	getBalanceCents: vi.fn(),
	rentActivationNumber: rentMock,
	getSms: getSmsMock,
	cancelRent: cancelRentMock,
	HubmanError
}));

import { hubmanProvider } from './hubman-provider';

describe('hubmanProvider.pollSms mapping', () => {
	beforeEach(() => getSmsMock.mockReset());

	it('waiting when hub-man returns null', async () => {
		getSmsMock.mockResolvedValue(null);
		expect(await hubmanProvider.pollSms('u')).toEqual({ status: 'waiting' });
	});

	it('received with the parsed otp', async () => {
		getSmsMock.mockResolvedValue({ otp: '483920', message: 'code 483920', sender_name: 'WA' });
		expect(await hubmanProvider.pollSms('u')).toMatchObject({ status: 'received', otp: '483920' });
	});

	it('received with an EXTRACTED otp when the code is only in the message (leak-class guard)', async () => {
		getSmsMock.mockResolvedValue({ otp: '', message: 'Your code is 771234', sender_name: '' });
		expect(await hubmanProvider.pollSms('u')).toMatchObject({ status: 'received', otp: '771234' });
	});

	// The 422→expired and transient→error branches live in hubman-provider-errors.spec.ts
	// (isolated so vitest's unhandled-rejection tracker doesn't trip on the throwing spy).
});

describe('hubmanProvider.rent mapping', () => {
	it('normalizes HubmanRentResult (int phone/price, string expiry)', async () => {
		rentMock.mockResolvedValue({
			order_uuid: 'uuid-1',
			phone_number: 15551234567,
			price_cents: 55,
			expires_at: '2026-08-04T00:20:00Z'
		});
		const r = await hubmanProvider.rent({
			serviceId: 1,
			countryId: 2,
			serviceName: 'WhatsApp',
			countryName: 'USA',
			providerServiceRef: '1',
			providerCountryRef: '2',
			maxPriceCents: 100,
			expectedCostCents: 50
		});
		expect(r).toMatchObject({ providerRef: 'uuid-1', phoneNumber: '15551234567', costCents: 55 });
		expect(r.expiresAt).toBeInstanceOf(Date);
	});

	it('falls back to expectedCostCents when hub-man omits a price', async () => {
		rentMock.mockResolvedValue({ order_uuid: 'u2', phone_number: '1555', price_cents: 0, expires_at: '' });
		const r = await hubmanProvider.rent({
			serviceId: 1, countryId: 2, serviceName: 'X', countryName: 'US',
			providerServiceRef: '1', providerCountryRef: '2', maxPriceCents: 100, expectedCostCents: 42
		});
		expect(r.costCents).toBe(42);
		expect(r.expiresAt).toBeNull();
	});
});
