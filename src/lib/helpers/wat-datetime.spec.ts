import { describe, expect, it } from 'vitest';
import { dateToWatInput, watInputToDate } from './wat-datetime';

describe('WAT date inputs', () => {
	it('reads a WAT time as the right instant (UTC+1)', () => {
		expect(watInputToDate('2026-11-01T00:00')?.toISOString()).toBe('2026-10-31T23:00:00.000Z');
	});
	it('round-trips and treats blank as not set', () => {
		const at = watInputToDate('2026-11-01T09:30');
		expect(dateToWatInput(at)).toBe('2026-11-01T09:30');
		expect(watInputToDate('')).toBeNull();
		expect(dateToWatInput(null)).toBe('');
	});
});
