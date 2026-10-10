import { describe, expect, it } from 'vitest';
import { buildOrderAttribution } from './order-attribution';
import { sanitizeCustomerOrder } from '$lib/helpers/customer-order-visibility';

const last = {
	source: 'propellerads',
	medium: 'push',
	campaign: '183788',
	content: '5551',
	clickId: 'click-1',
	landing: '/platforms/x',
	landedAt: '2026-10-10T11:00:00.000Z'
};

describe('buildOrderAttribution', () => {
	it('snapshots both touches with a capture time', () => {
		expect(
			buildOrderAttribution({ first: null, last }, new Date('2026-10-10T12:00:00.000Z'))
		).toEqual({ first: null, last, capturedAt: '2026-10-10T12:00:00.000Z' });
	});

	it('stores nothing when there is no consented attribution', () => {
		expect(buildOrderAttribution(undefined)).toBeNull();
		expect(buildOrderAttribution({ first: null, last: null })).toBeNull();
	});
});

describe('privacy (payments owner rule C1)', () => {
	it('never exposes attribution or analytics metadata in customer order responses', () => {
		const order = {
			id: 'order-1',
			orderNumber: 'ORD-1',
			status: 'completed',
			paymentStatus: 'paid',
			totalAmount: 6000,
			analyticsMetadata: {
				attribution: buildOrderAttribution({ first: null, last }),
				adPostbackState: 'sent'
			},
			orderItems: []
		};

		const serialized = JSON.stringify(sanitizeCustomerOrder(order));

		expect(serialized).not.toContain('analyticsMetadata');
		expect(serialized).not.toContain('click-1');
		expect(serialized).not.toContain('adPostback');
	});
});
