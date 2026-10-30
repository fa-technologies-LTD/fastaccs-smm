import { describe, expect, it } from 'vitest';
import { AUTOMATION_JOBS, type AutomationJobDefinition } from './automation-jobs';
import { latestCronOccurrence, missedAutomationRun } from './automation-schedule-health';

describe('calendar-aware automation health', () => {
	it('finds the prior onboarding window during the intentional overnight gap', () => {
		expect(
			latestCronOccurrence('30 8,12,16,20 * * *', new Date('2026-10-30T06:34:23.000Z'))
		).toEqual(new Date('2026-10-29T20:30:00.000Z'));
	});

	it('keeps onboarding healthy before the first daily run', () => {
		const missed = missedAutomationRun(
			AUTOMATION_JOBS.onboarding,
			new Date('2026-10-29T20:30:04.280Z'),
			new Date('2026-10-30T07:04:23.000Z')
		);

		expect(missed).toBeNull();
	});

	it('alerts after a scheduled onboarding run is genuinely missed', () => {
		const missed = missedAutomationRun(
			AUTOMATION_JOBS.onboarding,
			new Date('2026-10-29T20:30:04.280Z'),
			new Date('2026-10-30T09:04:23.000Z')
		);

		expect(missed).toEqual(new Date('2026-10-30T08:30:00.000Z'));
	});

	it('accepts a completed run in the latest onboarding window', () => {
		const missed = missedAutomationRun(
			AUTOMATION_JOBS.onboarding,
			new Date('2026-10-30T08:30:02.000Z'),
			new Date('2026-10-30T09:04:23.000Z')
		);

		expect(missed).toBeNull();
	});

	it('detects missed windows for frequent jobs after their grace period', () => {
		const missed = missedAutomationRun(
			AUTOMATION_JOBS['payments-reconcile'],
			new Date('2026-10-30T08:31:02.000Z'),
			new Date('2026-10-30T09:04:23.000Z')
		);

		expect(missed).toEqual(new Date('2026-10-30T08:41:00.000Z'));
	});

	it('never marks a manual-only job overdue', () => {
		const manualJob: AutomationJobDefinition = {
			name: 'manual-test',
			path: '/manual-test',
			schedule: 'manual only',
			risk: 'operational',
			lockTimeoutMinutes: 10,
			expectedIntervalMinutes: 0
		};

		expect(
			missedAutomationRun(
				manualJob,
				new Date('2025-01-01T00:00:00.000Z'),
				new Date('2026-10-30T09:04:23.000Z')
			)
		).toBeNull();
	});
});
