import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUTOMATION_JOBS } from './automation-jobs';

type VercelConfig = {
	crons: Array<{ path: string; schedule: string }>;
};

const vercel = JSON.parse(
	readFileSync(new URL('../../../vercel.json', import.meta.url), 'utf8')
) as VercelConfig;
const schedules = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));

describe('cost-aware production automation schedules', () => {
	it('keeps every monitored automatic job represented in Vercel', () => {
		for (const job of Object.values(AUTOMATION_JOBS)) {
			if (job.expectedIntervalMinutes === 0) continue;
			expect(schedules.has(job.path), `${job.name} is missing from vercel.json`).toBe(true);
		}
	});

	it('preserves fast live recovery while allowing Neon to become idle', () => {
		expect(schedules.get('/api/internal/cron/phone-rentals-sweep')).toBe(
			'0,10,20,30,40,50 * * * *'
		);
		expect(schedules.get('/api/internal/cron/payments-reconcile')).toBe('1,11,21,31,41,51 * * * *');
		expect(AUTOMATION_JOBS['phone-rentals-sweep'].expectedIntervalMinutes).toBe(10);
		expect(AUTOMATION_JOBS['payments-reconcile'].expectedIntervalMinutes).toBe(10);
	});

	it('syncs the discovery catalogue less often and staggers work inside short wake windows', () => {
		expect(schedules.get('/api/internal/cron/numbers-catalog-sync')).toBe('2,32 * * * *');
		expect(AUTOMATION_JOBS['numbers-catalog-sync'].expectedIntervalMinutes).toBe(30);
		expect(schedules.get('/api/internal/cron/boosting-catalog-sync')).toBe('17 */6 * * *');
		expect(AUTOMATION_JOBS['boosting-catalog-sync'].expectedIntervalMinutes).toBe(360);
		expect(schedules.get('/api/internal/cron/boosting-fulfillment')).toBe(
			'6,11,16,21,26,31,36,41,46,51,56 * * * *'
		);
		expect(AUTOMATION_JOBS['boosting-fulfillment'].expectedIntervalMinutes).toBe(5);
		expect(schedules.get('/api/internal/cron/boosting-refills')).toBe(
			'3,8,13,18,23,28,33,38,43,48,53,58 * * * *'
		);
		expect(AUTOMATION_JOBS['boosting-refills'].expectedIntervalMinutes).toBe(5);

		expect(schedules.get('/api/internal/cron/exact-preview-thumbnails')).toBe('0 * * * *');
		expect(schedules.get('/api/internal/cron/low-stock-alerts')).toBe('1 * * * *');
		expect(schedules.get('/api/internal/cron/automation-health')).toBe('4 * * * *');
		expect(schedules.get('/api/internal/cron/abandoned-orders')).toBe('3,23,43 * * * *');
	});

	it('runs marketing jobs inside existing wake windows', () => {
		expect(schedules.get('/api/internal/cron/marketing-postbacks')).toBe('5,35 * * * *');
		expect(AUTOMATION_JOBS['marketing-postbacks'].expectedIntervalMinutes).toBe(30);
		expect(schedules.get('/api/internal/cron/marketing-spend-sync')).toBe('7 * * * *');
		expect(AUTOMATION_JOBS['marketing-spend-sync'].expectedIntervalMinutes).toBe(60);
	});

	it('checks Telegram replies every minute without keeping the database awake any longer', () => {
		expect(schedules.get('/api/internal/cron/telegram-autopilot')).toBe('* * * * *');
		// Other jobs already wake the database at least every 3 minutes (well inside its idle
		// timeout), so a quick check each minute adds no extra wake-ups. If jobs are ever spread out
		// to let the database sleep, revisit this schedule.
		const awake = new Set<number>();
		for (const [path, schedule] of schedules) {
			const [minutes, hours] = schedule.split(' ');
			if (path.endsWith('/telegram-autopilot') || hours !== '*') continue;
			for (const minute of minutes.split(',')) awake.add(Number(minute));
		}
		const sorted = [...awake].sort((a, b) => a - b);
		const gaps = sorted.map(
			(minute, i) => (sorted[(i + 1) % sorted.length] - minute + 60) % 60 || 60
		);
		expect(Math.max(...gaps)).toBeLessThanOrEqual(3);
		expect(AUTOMATION_JOBS['telegram-autopilot'].expectedIntervalMinutes).toBe(15);
	});

	it('sends the Boosting check every 12 hours on a minute the database is already awake', () => {
		expect(schedules.get('/api/internal/cron/boosting-health-report')).toBe('1 7,19 * * *');
		expect(schedules.get('/api/internal/cron/low-stock-alerts')).toBe('1 * * * *');
		expect(AUTOMATION_JOBS['boosting-health-report'].expectedIntervalMinutes).toBe(720);
	});
});
