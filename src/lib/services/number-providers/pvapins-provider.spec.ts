import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSmsMock = vi.hoisted(() => vi.fn());
const rentNumberMock = vi.hoisted(() => vi.fn());
const rejectMock = vi.hoisted(() => vi.fn());

vi.mock('../pvapins', () => ({
	isPvapinsConfigured: () => true,
	getBalanceCents: vi.fn(),
	rentNumber: rentNumberMock,
	getSms: getSmsMock,
	rejectNumber: rejectMock
}));

import { pvapinsProvider } from './pvapins-provider';
import { decodePvapinsRef } from './pvapins-provider';

describe('pvapinsProvider', () => {
	beforeEach(() => {
		getSmsMock.mockReset();
		rentNumberMock.mockReset();
		rejectMock.mockReset();
	});

	it('rent packs number|country|app into providerRef and carries expected cost (pay-on-success)', async () => {
		rentNumberMock.mockResolvedValue('13865902416');
		const r = await pvapinsProvider.rent({
			serviceId: 1,
			countryId: 2,
			serviceName: 'WhatsApp',
			countryName: 'USA',
			providerServiceRef: 'Whatsapp24',
			providerCountryRef: 'USA',
			maxPriceCents: 0,
			expectedCostCents: 66
		});
		expect(r.phoneNumber).toBe('13865902416');
		expect(r.costCents).toBe(66);
		expect(r.expiresAt).toBeNull();
		expect(decodePvapinsRef(r.providerRef)).toEqual({
			number: '13865902416',
			country: 'USA',
			app: 'Whatsapp24'
		});
	});

	it('pollSms decodes the ref and passes the parsed result straight through', async () => {
		getSmsMock.mockResolvedValue({ status: 'received', otp: '418494', message: 'Use code 418494' });
		const res = await pvapinsProvider.pollSms('13865902416|USA|Whatsapp24');
		expect(getSmsMock).toHaveBeenCalledWith({ number: '13865902416', country: 'USA', app: 'Whatsapp24' });
		expect(res).toMatchObject({ status: 'received', otp: '418494' });
	});

	it('cancel decodes the ref', async () => {
		rejectMock.mockResolvedValue(true);
		const ok = await pvapinsProvider.cancel('13865902416|USA|Whatsapp24');
		expect(ok).toBe(true);
		expect(rejectMock).toHaveBeenCalledWith({ number: '13865902416', country: 'USA', app: 'Whatsapp24' });
	});

	it('billing model is pay-on-success', () => {
		expect(pvapinsProvider.billing).toBe('pay-on-success');
	});
});
