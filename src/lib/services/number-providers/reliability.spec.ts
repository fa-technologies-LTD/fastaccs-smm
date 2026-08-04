import { describe, it, expect } from 'vitest';
import { summarizeReliability, candidateKeyFromRental } from './reliability';

describe('candidateKeyFromRental', () => {
	it('keys a pvapins rental by its app-variant (the supplier)', () => {
		expect(
			candidateKeyFromRental({ provider: 'pvapins', providerRef: '13865902416|USA|Whatsapp24', serviceId: 1 })
		).toBe('pvapins:Whatsapp24');
	});
	it('keys a hub-man rental by service id', () => {
		expect(candidateKeyFromRental({ provider: 'hubman', providerRef: null, serviceId: 1 })).toBe('hubman:1');
	});
	it('falls back to hub-man keying when a pvapins ref is missing', () => {
		expect(candidateKeyFromRental({ provider: 'pvapins', providerRef: null, serviceId: 2 })).toBe('hubman:2');
	});
});

describe('summarizeReliability', () => {
	it('computes per-supplier success rate', () => {
		const stats = summarizeReliability([
			{ key: 'pvapins:Whatsapp24', received: true },
			{ key: 'pvapins:Whatsapp24', received: true },
			{ key: 'pvapins:Whatsapp24', received: false },
			{ key: 'pvapins:Whatsapp46', received: false },
			{ key: 'pvapins:Whatsapp46', received: false }
		]);
		expect(stats.get('pvapins:Whatsapp24')).toEqual({ received: 2, total: 3, reliability: 2 / 3 });
		expect(stats.get('pvapins:Whatsapp46')).toEqual({ received: 0, total: 2, reliability: 0 });
	});

	it('is empty for no rows', () => {
		expect(summarizeReliability([]).size).toBe(0);
	});
});
