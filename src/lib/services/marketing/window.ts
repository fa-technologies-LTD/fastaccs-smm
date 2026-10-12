import { getBusinessDateKey, getStartOfBusinessDayUtc } from '$lib/helpers/business-timezone';

/**
 * Reporting window on business-calendar days (Africa/Lagos by default), as of `now`: today plus the
 * previous `days - 1` days. Both ends are bounded so spend booked for future days never inflates
 * the current window:
 *   spend:  sinceDay <= day <= untilDay      (business-day dates)
 *   orders: sinceUtc <= paid_at < untilUtc   (local midnight of the first day → of tomorrow)
 */
export interface ReportWindow {
	days: number;
	sinceDay: string;
	untilDay: string;
	sinceUtc: Date;
	untilUtc: Date;
}

export function businessWindow(days: number, now: Date, timeZone: string): ReportWindow {
	const span = Math.max(1, days);
	const firstDay = new Date(now.getTime() - (span - 1) * 86_400_000);
	const startOfToday = getStartOfBusinessDayUtc(now, timeZone);
	// 26h past local midnight is always inside tomorrow, even across DST shifts.
	const startOfTomorrow = getStartOfBusinessDayUtc(
		new Date(startOfToday.getTime() + 26 * 3_600_000),
		timeZone
	);
	return {
		days: span,
		sinceDay: getBusinessDateKey(firstDay, timeZone),
		untilDay: getBusinessDateKey(now, timeZone),
		sinceUtc: getStartOfBusinessDayUtc(firstDay, timeZone),
		untilUtc: startOfTomorrow
	};
}
