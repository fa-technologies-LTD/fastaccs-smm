import { describe, it, expect } from 'vitest';
import { rfmSegment, monthsBetween, monthKey } from './customer-analytics';

describe('rfmSegment', () => {
	it('VIP = frequent, recent, top spender', () => {
		expect(rfmSegment(10, 5, true)).toBe('VIP');
	});
	it('Loyal = frequent + recent but not a top spender', () => {
		expect(rfmSegment(10, 5, false)).toBe('Loyal');
		expect(rfmSegment(80, 2, false)).toBe('Loyal'); // 2 orders within 90d
	});
	it('New = 1–2 orders, very recent', () => {
		expect(rfmSegment(10, 1, false)).toBe('New');
	});
	it('At-risk = was a buyer, 90–180 days quiet', () => {
		expect(rfmSegment(120, 2, false)).toBe('At-risk');
		expect(rfmSegment(150, 1, false)).toBe('At-risk');
	});
	it('Churned = no purchase in 6+ months, regardless of history', () => {
		expect(rfmSegment(200, 10, true)).toBe('Churned');
	});
	it('Casual = low frequency, mid recency (30–90d)', () => {
		expect(rfmSegment(60, 1, false)).toBe('Casual');
	});
});

describe('month helpers', () => {
	it('monthKey formats YYYY-MM', () => {
		expect(monthKey(new Date('2026-07-03T12:00:00Z'))).toBe('2026-07');
	});
	it('monthsBetween counts calendar months', () => {
		expect(monthsBetween(new Date('2026-01-15'), new Date('2026-01-28'))).toBe(0);
		expect(monthsBetween(new Date('2026-01-15'), new Date('2026-04-02'))).toBe(3);
		expect(monthsBetween(new Date('2025-11-01'), new Date('2026-02-01'))).toBe(3);
	});
});
