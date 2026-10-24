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
		schedule: 'every 10 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 10
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
	'boosting-support-review': {
		name: 'boosting-support-review',
		path: '/api/internal/cron/boosting-support-review',
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
		schedule: 'every 10 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 10
	},
	'numbers-campaign': {
		name: 'numbers-campaign',
		path: '/api/internal/cron/numbers-campaign',
		schedule: 'daily 16:20 UTC (17:20 WAT)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 1440
	},
	'store-credit-reminders': {
		name: 'store-credit-reminders',
		path: '/api/internal/cron/store-credit-reminders',
		schedule: 'daily 16:15 UTC (17:15 WAT)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 1440
	},
	'numbers-catalog-sync': {
		name: 'numbers-catalog-sync',
		path: '/api/internal/cron/numbers-catalog-sync',
		schedule: 'every 30 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 30
	},
	'numbers-catalog-probe': {
		name: 'numbers-catalog-probe',
		path: '/api/internal/cron/numbers-catalog-probe',
		schedule: 'every 2 hours',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 120
	},
	'boosting-catalog-sync': {
		name: 'boosting-catalog-sync',
		path: '/api/internal/cron/boosting-catalog-sync',
		schedule: 'every 6 hours',
		risk: 'operational',
		lockTimeoutMinutes: 20,
		expectedIntervalMinutes: 360
	},
	'boosting-fulfillment': {
		name: 'boosting-fulfillment',
		path: '/api/internal/cron/boosting-fulfillment',
		schedule: 'every 5 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 4,
		expectedIntervalMinutes: 5
	},
	'boosting-refills': {
		name: 'boosting-refills',
		path: '/api/internal/cron/boosting-refills',
		schedule: 'every 5 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 4,
		expectedIntervalMinutes: 5
	},
	'boosting-draft-suggestions': {
		name: 'boosting-draft-suggestions',
		path: '/api/internal/cron/boosting-draft-suggestions',
		schedule: 'manual (hidden drafts only)',
		risk: 'operational',
		lockTimeoutMinutes: 20,
		expectedIntervalMinutes: 0
	},
	'boosting-shadow-route': {
		name: 'boosting-shadow-route',
		path: '/api/internal/cron/boosting-shadow-route',
		schedule: 'manual (no supplier orders)',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 0
	},
	'promo-reminder': {
		name: 'promo-reminder',
		path: '/api/internal/cron/promo-reminder',
		schedule: 'daily 16:05 UTC (17:05 WAT)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 1440
	},
	'marketing-postbacks': {
		name: 'marketing-postbacks',
		path: '/api/internal/cron/marketing-postbacks',
		schedule: 'every 30 minutes (:05, :35)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 30
	},
	'boosting-health-report': {
		name: 'boosting-health-report',
		path: '/api/internal/cron/boosting-health-report',
		schedule: 'every 12 hours (08:01 and 20:01 WAT)',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 720
	},
	'telegram-autopilot': {
		name: 'telegram-autopilot',
		path: '/api/internal/cron/telegram-autopilot',
		// Called on minutes other jobs already wake the database; full run :02/:17/:32/:47,
		// quick reply checks in between only while conversations are open.
		schedule: 'full run every 15 minutes (:02, :17, :32, :47); replies every 1–3 minutes',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 15
	},
	'marketing-spend-sync': {
		name: 'marketing-spend-sync',
		path: '/api/internal/cron/marketing-spend-sync',
		schedule: 'hourly (:07)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 60
	}
} as const satisfies Record<string, AutomationJobDefinition>;

export type AutomationJobName = keyof typeof AUTOMATION_JOBS;

export function getAutomationJob(name: AutomationJobName): AutomationJobDefinition {
	return AUTOMATION_JOBS[name];
}
