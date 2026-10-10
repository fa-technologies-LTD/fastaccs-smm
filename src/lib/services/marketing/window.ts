import { getBusinessDateKey, getStartOfBusinessDayUtc } from '$lib/helpers/business-timezone';

/**
 * Reporting window on business-calendar days (Africa/Lagos by default): today plus the previous
 * `days - 1` days. Spend is stored per business day (`sinceDay`), orders by timestamp (`sinceUtc`
 * = that day's local midnight), so both sides of cost-per-buyer cover the same period.
 */
export interface ReportWindow {
	days: number;
	sinceDay: string;
	sinceUtc: Date;
}

export function businessWindow(days: number, now: Date, timeZone: string): ReportWindow {
	const firstDay = new Date(now.getTime() - (Math.max(1, days) - 1) * 86_400_000);
	return {
		days,
		sinceDay: getBusinessDateKey(firstDay, timeZone),
		sinceUtc: getStartOfBusinessDayUtc(firstDay, timeZone)
	};
}
