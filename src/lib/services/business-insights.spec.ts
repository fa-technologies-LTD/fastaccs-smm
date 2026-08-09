import { describe, it, expect } from 'vitest';
import { localDayHour } from './business-insights';

describe('localDayHour (WAT bucketing)', () => {
	it('shifts UTC to the local hour', () => {
		expect(localDayHour(new Date('2026-08-09T10:00:00Z'), 1).hour).toBe(11);
		expect(localDayHour(new Date('2026-08-09T10:00:00Z'), 0).hour).toBe(10);
	});
	it('rolls past midnight into the next day', () => {
		const before = localDayHour(new Date('2026-08-09T22:00:00Z'), 1); // 23:00 local, same date
		const after = localDayHour(new Date('2026-08-09T23:30:00Z'), 1); // 00:30 local, next date
		expect(after.hour).toBe(0);
		expect(after.day).toBe((before.day + 1) % 7);
	});
	it('day is always 0–6, hour 0–23', () => {
		const { day, hour } = localDayHour(new Date('2026-12-31T23:59:00Z'), 1);
		expect(day).toBeGreaterThanOrEqual(0);
		expect(day).toBeLessThanOrEqual(6);
		expect(hour).toBeGreaterThanOrEqual(0);
		expect(hour).toBeLessThanOrEqual(23);
	});
});
