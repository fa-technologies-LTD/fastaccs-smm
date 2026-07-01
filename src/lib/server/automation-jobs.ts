export type AutomationJobRisk = 'financial' | 'operational' | 'marketing';

export interface AutomationJobDefinition {
	name: string;
	path: string;
	schedule: string;
	risk: AutomationJobRisk;
	lockTimeoutMinutes: number;
	expectedIntervalMinutes: number;
	enabled?: boolean;
}

export const AUTOMATION_JOBS = {
	'payments-reconcile': {
		name: 'payments-reconcile',
		path: '/api/internal/cron/payments-reconcile',
		schedule: 'every 5 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 5
	},
	'abandoned-orders': {
		name: 'abandoned-orders',
		path: '/api/internal/cron/abandoned-orders',
		schedule: 'every 10 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 10
	},
	'exact-preview-thumbnails': {
		name: 'exact-preview-thumbnails',
		path: '/api/internal/cron/exact-preview-thumbnails',
		schedule: 'hourly',
		risk: 'operational',
		lockTimeoutMinutes: 50,
		expectedIntervalMinutes: 60
	},
	'low-stock-alerts': {
		name: 'low-stock-alerts',
		path: '/api/internal/cron/low-stock-alerts',
		schedule: 'hourly',
		risk: 'operational',
		lockTimeoutMinutes: 20,
		expectedIntervalMinutes: 60
	},
	onboarding: {
		name: 'onboarding',
		path: '/api/internal/cron/onboarding',
		schedule: 'every 4 hours',
		risk: 'marketing',
		lockTimeoutMinutes: 30,
		expectedIntervalMinutes: 240
	},
	nurture: {
		name: 'nurture',
		path: '/api/internal/cron/nurture',
		schedule: 'daily',
		risk: 'marketing',
		lockTimeoutMinutes: 30,
		expectedIntervalMinutes: 1440
	},
	'affiliate-lifecycle': {
		name: 'affiliate-lifecycle',
		path: '/api/internal/cron/affiliate-lifecycle',
		schedule: 'every 4 hours',
		risk: 'marketing',
		lockTimeoutMinutes: 45,
		expectedIntervalMinutes: 240
	},
	winback: {
		name: 'winback',
		path: '/api/internal/cron/winback',
		schedule: 'daily',
		risk: 'marketing',
		lockTimeoutMinutes: 60,
		expectedIntervalMinutes: 1440
	},
	'weekly-business-digest': {
		name: 'weekly-business-digest',
		path: '/api/internal/cron/weekly-business-digest',
		schedule: 'Sunday at 09:00 Africa/Lagos',
		risk: 'operational',
		lockTimeoutMinutes: 30,
		expectedIntervalMinutes: 10080
	},
	'automation-health': {
		name: 'automation-health',
		path: '/api/internal/cron/automation-health',
		schedule: 'hourly',
		risk: 'operational',
		lockTimeoutMinutes: 15,
		expectedIntervalMinutes: 60
	}
} as const satisfies Record<string, AutomationJobDefinition>;

export type AutomationJobName = keyof typeof AUTOMATION_JOBS;

export function getAutomationJob(name: AutomationJobName): AutomationJobDefinition {
	return AUTOMATION_JOBS[name];
}
