import { describe, expect, it } from 'vitest';
import { businessWindow } from './window';

describe('businessWindow', () => {
	it('covers whole Lagos days from the first day through today', () => {
		expect(businessWindow(7, new Date('2026-10-10T12:00:00.000Z'), 'Africa/Lagos')).toEqual({
			days: 7,
			sinceDay: '2026-10-04',
			untilDay: '2026-10-10',
			sinceUtc: new Date('2026-10-03T23:00:00.000Z'),
			untilUtc: new Date('2026-10-10T23:00:00.000Z')
		});
	});

	it('uses the Lagos date even late in the UTC evening', () => {
		// 23:30 UTC on the 9th is already 00:30 on the 10th in Lagos.
		const window = businessWindow(1, new Date('2026-10-09T23:30:00.000Z'), 'Africa/Lagos');
		expect(window.sinceDay).toBe('2026-10-10');
		expect(window.untilDay).toBe('2026-10-10');
		expect(window.untilUtc).toEqual(new Date('2026-10-10T23:00:00.000Z'));
	});
});
