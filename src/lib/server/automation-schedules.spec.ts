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

		expect(schedules.get('/api/internal/cron/exact-preview-thumbnails')).toBe('0 * * * *');
		expect(schedules.get('/api/internal/cron/low-stock-alerts')).toBe('1 * * * *');
		expect(schedules.get('/api/internal/cron/automation-health')).toBe('4 * * * *');
		expect(schedules.get('/api/internal/cron/abandoned-orders')).toBe('3,23,43 * * * *');
	});
});
