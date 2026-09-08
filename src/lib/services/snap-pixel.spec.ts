import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));

import { trackSnapEvent, trackSnapPurchase } from './snap-pixel';

class MemoryStorage {
	private values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	clear(): void {
		this.values.clear();
	}
}

const snaptr = Object.assign(vi.fn(), { queue: [] as unknown[] });
const storage = new MemoryStorage();

vi.stubGlobal('window', {
	location: { hostname: 'smm.fastaccs.com' },
	snaptr,
	__snapPixelBootstrapped: true
});
vi.stubGlobal('document', {
	querySelector: () => ({ src: 'https://sc-static.net/scevent.min.js' }),
	getElementsByTagName: () => [],
	cookie: ''
});
vi.stubGlobal('localStorage', storage);

describe('Snap Pixel events', () => {
	beforeEach(() => {
		snaptr.mockClear();
		storage.clear();
	});

	it('removes empty payload fields before queueing an event', () => {
		expect(
			trackSnapEvent('ADD_CART', {
				item_ids: ['tier-1', ''],
				description: ' ',
				price: 1500,
				currency: 'NGN'
			})
		).toBe(true);

		expect(snaptr).toHaveBeenCalledWith('track', 'ADD_CART', {
			item_ids: ['tier-1'],
			price: 1500,
			currency: 'NGN'
		});
	});

	it('records a verified order once and supplies matching deduplication IDs', () => {
		const payload = {
			transaction_id: 'order-123',
			price: 4200,
			currency: 'NGN'
		};

		expect(trackSnapPurchase(payload)).toBe(true);
		expect(trackSnapPurchase(payload)).toBe(false);
		expect(snaptr).toHaveBeenCalledTimes(1);
		expect(snaptr).toHaveBeenCalledWith('track', 'PURCHASE', {
			...payload,
			client_dedup_id: 'order-123'
		});
	});
});
