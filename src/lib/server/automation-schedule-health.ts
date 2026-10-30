import type { AutomationJobDefinition } from './automation-jobs';

const MINUTES_PER_DAY = 24 * 60;
const MAX_CRON_LOOKBACK_MINUTES = 32 * MINUTES_PER_DAY;

function integer(value: string): number | null {
	if (!/^\d+$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

function cronFieldMatches(value: number, expression: string, minimum: number, maximum: number) {
	return expression.split(',').some((rawPart) => {
		const [rawRange, rawStep] = rawPart.trim().split('/');
		const step = rawStep === undefined ? 1 : integer(rawStep);
		if (!step || step < 1) return false;

		let start: number;
		let end: number;
		if (rawRange === '*') {
			start = minimum;
			end = maximum;
		} else if (rawRange.includes('-')) {
			const [rawStart, rawEnd] = rawRange.split('-');
			const parsedStart = integer(rawStart);
			const parsedEnd = integer(rawEnd);
			if (parsedStart === null || parsedEnd === null) return false;
			start = parsedStart;
			end = parsedEnd;
		} else {
			const parsed = integer(rawRange);
			if (parsed === null) return false;
			start = parsed;
			end = parsed;
		}

		if (start < minimum || end > maximum || start > end || value < start || value > end)
			return false;
		return (value - start) % step === 0;
	});
}

function dayOfWeekMatches(value: number, expression: string) {
	if (cronFieldMatches(value, expression, 0, 6)) return true;
	// Cron accepts both 0 and 7 for Sunday.
	return value === 0 && expression.split(',').some((part) => part.trim() === '7');
}

function cronMatches(date: Date, expression: string) {
	const fields = expression.trim().split(/\s+/);
	if (fields.length !== 5) return false;
	const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
	return (
		cronFieldMatches(date.getUTCMinutes(), minute, 0, 59) &&
		cronFieldMatches(date.getUTCHours(), hour, 0, 23) &&
		cronFieldMatches(date.getUTCDate(), dayOfMonth, 1, 31) &&
		cronFieldMatches(date.getUTCMonth() + 1, month, 1, 12) &&
		dayOfWeekMatches(date.getUTCDay(), dayOfWeek)
	);
}

export function latestCronOccurrence(expression: string, atOrBefore: Date): Date | null {
	const candidate = new Date(atOrBefore);
	candidate.setUTCSeconds(0, 0);
	for (let checked = 0; checked <= MAX_CRON_LOOKBACK_MINUTES; checked += 1) {
		if (cronMatches(candidate, expression)) return candidate;
		candidate.setUTCMinutes(candidate.getUTCMinutes() - 1);
	}
	return null;
}

function healthGraceMinutes(job: AutomationJobDefinition) {
	return job.healthGraceMinutes ?? Math.max(15, Math.min(job.lockTimeoutMinutes, 30));
}

/**
 * Returns the scheduled window that has been missed, or null when the latest run is current.
 * Cron-backed jobs are compared with their real UTC schedule so an intentional overnight gap
 * cannot be mistaken for an outage.
 */
export function missedAutomationRun(
	job: AutomationJobDefinition,
	latestRunAt: Date,
	now = new Date()
): Date | null {
	if (job.expectedIntervalMinutes <= 0) return null;

	if (job.cronSchedule) {
		const maturedAt = new Date(now.getTime() - healthGraceMinutes(job) * 60_000);
		const expectedRun = latestCronOccurrence(job.cronSchedule, maturedAt);
		return expectedRun && latestRunAt < expectedRun ? expectedRun : null;
	}

	const graceMinutes = Math.max(job.expectedIntervalMinutes * 2.5, 30);
	const threshold = new Date(now.getTime() - graceMinutes * 60_000);
	return latestRunAt < threshold ? threshold : null;
}
