export type AutomationJobRisk = 'financial' | 'operational' | 'marketing';

export interface AutomationJobDefinition {
	name: string;
	path: string;
	schedule: string;
	risk: AutomationJobRisk;
	lockTimeoutMinutes: number;
	expectedIntervalMinutes: number;
	cronSchedule?: string;
	healthGraceMinutes?: number;
	enabled?: boolean;
}

export const AUTOMATION_JOBS = {
	'payments-reconcile': {
		name: 'payments-reconcile',
		path: '/api/internal/cron/payments-reconcile',
		schedule: 'every 10 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 10,
		cronSchedule: '1,11,21,31,41,51 * * * *'
	},
	'abandoned-orders': {
		name: 'abandoned-orders',
		path: '/api/internal/cron/abandoned-orders',
		schedule: 'every 20 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 20,
		cronSchedule: '3,23,43 * * * *'
	},
	'exact-preview-thumbnails': {
		name: 'exact-preview-thumbnails',
		path: '/api/internal/cron/exact-preview-thumbnails',
		schedule: 'hourly',
		risk: 'operational',
		lockTimeoutMinutes: 50,
		expectedIntervalMinutes: 60,
		cronSchedule: '0 * * * *'
	},
	'low-stock-alerts': {
		name: 'low-stock-alerts',
		path: '/api/internal/cron/low-stock-alerts',
		schedule: 'hourly',
		risk: 'operational',
		lockTimeoutMinutes: 20,
		expectedIntervalMinutes: 60,
		cronSchedule: '1 * * * *'
	},
	onboarding: {
		name: 'onboarding',
		path: '/api/internal/cron/onboarding',
		schedule: 'four times daily (08:30, 12:30, 16:30 and 20:30 UTC)',
		risk: 'marketing',
		lockTimeoutMinutes: 30,
		expectedIntervalMinutes: 240,
		cronSchedule: '30 8,12,16,20 * * *',
		healthGraceMinutes: 30
	},
	nurture: {
		name: 'nurture',
		path: '/api/internal/cron/nurture',
		schedule: 'daily',
		risk: 'marketing',
		lockTimeoutMinutes: 30,
		expectedIntervalMinutes: 1440,
		cronSchedule: '0 16 * * *'
	},
	'affiliate-lifecycle': {
		name: 'affiliate-lifecycle',
		path: '/api/internal/cron/affiliate-lifecycle',
		schedule: 'every 4 hours',
		risk: 'marketing',
		lockTimeoutMinutes: 45,
		expectedIntervalMinutes: 240,
		cronSchedule: '3 */4 * * *'
	},
	winback: {
		name: 'winback',
		path: '/api/internal/cron/winback',
		schedule: 'daily',
		risk: 'marketing',
		lockTimeoutMinutes: 60,
		expectedIntervalMinutes: 1440,
		cronSchedule: '10 16 * * *'
	},
	'weekly-business-digest': {
		name: 'weekly-business-digest',
		path: '/api/internal/cron/weekly-business-digest',
		schedule: 'Sunday at 09:00 Africa/Lagos',
		risk: 'operational',
		lockTimeoutMinutes: 30,
		expectedIntervalMinutes: 10080,
		cronSchedule: '0 8 * * 0'
	},
	'automation-health': {
		name: 'automation-health',
		path: '/api/internal/cron/automation-health',
		schedule: 'hourly',
		risk: 'operational',
		lockTimeoutMinutes: 15,
		expectedIntervalMinutes: 60,
		cronSchedule: '4 * * * *'
	},
	'boosting-support-review': {
		name: 'boosting-support-review',
		path: '/api/internal/cron/boosting-support-review',
		schedule: 'hourly',
		risk: 'operational',
		lockTimeoutMinutes: 15,
		expectedIntervalMinutes: 60,
		cronSchedule: '9 * * * *'
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
		expectedIntervalMinutes: 180,
		cronSchedule: '4 */3 * * *'
	},
	'phone-rentals-sweep': {
		name: 'phone-rentals-sweep',
		path: '/api/internal/cron/phone-rentals-sweep',
		schedule: 'every 10 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 10,
		cronSchedule: '0,10,20,30,40,50 * * * *'
	},
	'numbers-campaign': {
		name: 'numbers-campaign',
		path: '/api/internal/cron/numbers-campaign',
		schedule: 'daily 16:20 UTC (17:20 WAT)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 1440,
		cronSchedule: '20 16 * * *'
	},
	'store-credit-reminders': {
		name: 'store-credit-reminders',
		path: '/api/internal/cron/store-credit-reminders',
		schedule: 'daily 16:15 UTC (17:15 WAT)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 1440,
		cronSchedule: '15 16 * * *'
	},
	'numbers-catalog-sync': {
		name: 'numbers-catalog-sync',
		path: '/api/internal/cron/numbers-catalog-sync',
		schedule: 'every 30 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 30,
		cronSchedule: '2,32 * * * *'
	},
	'numbers-catalog-probe': {
		name: 'numbers-catalog-probe',
		path: '/api/internal/cron/numbers-catalog-probe',
		schedule: 'every 2 hours',
		risk: 'financial',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 120,
		cronSchedule: '4 */2 * * *'
	},
	'boosting-catalog-sync': {
		name: 'boosting-catalog-sync',
		path: '/api/internal/cron/boosting-catalog-sync',
		schedule: 'every 6 hours',
		risk: 'operational',
		lockTimeoutMinutes: 20,
		expectedIntervalMinutes: 360,
		cronSchedule: '17 */6 * * *'
	},
	'boosting-fulfillment': {
		name: 'boosting-fulfillment',
		path: '/api/internal/cron/boosting-fulfillment',
		schedule: 'every 5 minutes',
		risk: 'financial',
		lockTimeoutMinutes: 4,
		expectedIntervalMinutes: 5,
		cronSchedule: '6,11,16,21,26,31,36,41,46,51,56 * * * *'
	},
	'boosting-refills': {
		name: 'boosting-refills',
		path: '/api/internal/cron/boosting-refills',
		schedule: 'every 5 minutes',
		risk: 'operational',
		lockTimeoutMinutes: 4,
		expectedIntervalMinutes: 5,
		cronSchedule: '3,8,13,18,23,28,33,38,43,48,53,58 * * * *'
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
		expectedIntervalMinutes: 1440,
		cronSchedule: '5 16 * * *'
	},
	'marketing-postbacks': {
		name: 'marketing-postbacks',
		path: '/api/internal/cron/marketing-postbacks',
		schedule: 'every 30 minutes (:05, :35)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 30,
		cronSchedule: '5,35 * * * *'
	},
	'boosting-health-report': {
		name: 'boosting-health-report',
		path: '/api/internal/cron/boosting-health-report',
		schedule: 'every 12 hours (08:01 and 20:01 WAT)',
		risk: 'operational',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 720,
		cronSchedule: '1 7,19 * * *'
	},
	'telegram-autopilot': {
		name: 'telegram-autopilot',
		path: '/api/internal/cron/telegram-autopilot',
		// Called every minute: full run :02/:17/:32/:47, quick reply checks in between only while
		// conversations are open (other jobs already keep the database awake, so no extra wake-ups).
		schedule: 'full run every 15 minutes (:02, :17, :32, :47); replies checked every minute',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 15,
		cronSchedule: '* * * * *'
	},
	'marketing-spend-sync': {
		name: 'marketing-spend-sync',
		path: '/api/internal/cron/marketing-spend-sync',
		schedule: 'hourly (:07)',
		risk: 'marketing',
		lockTimeoutMinutes: 10,
		expectedIntervalMinutes: 60,
		cronSchedule: '7 * * * *'
	}
} as const satisfies Record<string, AutomationJobDefinition>;

export type AutomationJobName = keyof typeof AUTOMATION_JOBS;

export function getAutomationJob(name: AutomationJobName): AutomationJobDefinition {
	return AUTOMATION_JOBS[name];
}
