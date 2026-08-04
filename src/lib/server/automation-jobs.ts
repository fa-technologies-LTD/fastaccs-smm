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
		schedule: 'every 15 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 15
	},
	'abandoned-orders': {
		name: 'abandoned-orders',
		path: '/api/internal/cron/abandoned-orders',
		schedule: 'every 20 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 20
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
	},
	'affiliate-announcement': {
		name: 'affiliate-announcement',
		path: '/api/internal/cron/affiliate-announcement',
		schedule: 'manual (one-time)',
		risk: 'marketing',
		lockTimeoutMinutes: 15,
		expectedIntervalMinutes: 0
	},
	'affiliate-vesting': {
		name: 'affiliate-vesting',
		path: '/api/internal/cron/affiliate-vesting',
		schedule: 'every 3 hours',
		risk: 'financial',
		lockTimeoutMinutes: 15,
		expectedIntervalMinutes: 180
	},
	'phone-rentals-sweep': {
		name: 'phone-rentals-sweep',
		path: '/api/internal/cron/phone-rentals-sweep',
		schedule: 'every 5 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 5
	},
	'numbers-campaign': {
		name: 'numbers-campaign',
		path: '/api/internal/cron/numbers-campaign',
		schedule: 'daily 09:30',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 1440
	},
	'numbers-catalog-sync': {
		name: 'numbers-catalog-sync',
		path: '/api/internal/cron/numbers-catalog-sync',
		schedule: 'every 5 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 5
	},
	'promo-reminder': {
		name: 'promo-reminder',
		path: '/api/internal/cron/promo-reminder',
		schedule: 'daily 10:10',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 1440
	}
} as const satisfies Record<string, AutomationJobDefinition>;

export type AutomationJobName = keyof typeof AUTOMATION_JOBS;

export function getAutomationJob(name: AutomationJobName): AutomationJobDefinition {
	return AUTOMATION_JOBS[name];
}
