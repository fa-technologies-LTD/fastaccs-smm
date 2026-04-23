interface DateParts {
	year: number;
	month: number;
	day: number;
	hour: number;
	minute: number;
	second: number;
}

const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
	const key = timeZone.trim() || 'Africa/Lagos';
	const cached = PARTS_FORMATTER_CACHE.get(key);
	if (cached) return cached;

	const formatter = new Intl.DateTimeFormat('en-CA', {
		timeZone: key,
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});
	PARTS_FORMATTER_CACHE.set(key, formatter);
	return formatter;
}

function getDateParts(date: Date, timeZone: string): DateParts {
	const parts = getPartsFormatter(timeZone).formatToParts(date);
	const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return {
		year: Number(byType.year || 0),
		month: Number(byType.month || 0),
		day: Number(byType.day || 0),
		hour: Number(byType.hour || 0),
		minute: Number(byType.minute || 0),
		second: Number(byType.second || 0)
	};
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
	const parts = getDateParts(date, timeZone);
	const asUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second
	);
	return asUtc - date.getTime();
}

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}

export function getBusinessDateKey(date: Date, timeZone: string): string {
	const parts = getDateParts(date, timeZone);
	return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function getBusinessMonthKey(date: Date, timeZone: string): string {
	const parts = getDateParts(date, timeZone);
	return `${parts.year}-${pad2(parts.month)}`;
}

export function getBusinessWeekKey(date: Date, timeZone: string): string {
	const parts = getDateParts(date, timeZone);
	const utcDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
	const dayNumber = utcDate.getUTCDay() || 7;
	utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);

	const isoYear = utcDate.getUTCFullYear();
	const yearStart = new Date(Date.UTC(isoYear, 0, 1));
	const weekNumber = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

	return `${isoYear}-W${pad2(weekNumber)}`;
}

export function getStartOfBusinessDayUtc(date: Date, timeZone: string): Date {
	const parts = getDateParts(date, timeZone);
	const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
	const offsetMs = getTimeZoneOffsetMs(utcGuess, timeZone);
	return new Date(utcGuess.getTime() - offsetMs);
}

export function getRollingBusinessDateKeys(days: number, now: Date, timeZone: string): string[] {
	const keys: string[] = [];
	for (let index = days - 1; index >= 0; index -= 1) {
		const date = new Date(now.getTime() - index * 24 * 60 * 60 * 1000);
		keys.push(getBusinessDateKey(date, timeZone));
	}
	return keys;
}
