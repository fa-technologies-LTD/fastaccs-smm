/** West Africa Time is UTC+1 all year (no daylight saving). */
const WAT_OFFSET_MS = 60 * 60 * 1000;

/** "2026-11-01T09:30" typed in WAT → the exact instant, or null if blank/invalid. */
export function watInputToDate(value: unknown): Date | null {
	if (typeof value !== 'string') return null;
	const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
	if (!match) return null;
	const [, y, m, d, hh, mm] = match.map(Number);
	const utc = Date.UTC(y, m - 1, d, hh, mm) - WAT_OFFSET_MS;
	const at = new Date(utc);
	return Number.isNaN(at.getTime()) ? null : at;
}

/** An instant → the WAT value for a datetime-local input ("" when not set). */
export function dateToWatInput(at: Date | null): string {
	if (!at) return '';
	const wat = new Date(at.getTime() + WAT_OFFSET_MS);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${wat.getUTCFullYear()}-${pad(wat.getUTCMonth() + 1)}-${pad(wat.getUTCDate())}T${pad(
		wat.getUTCHours()
	)}:${pad(wat.getUTCMinutes())}`;
}
