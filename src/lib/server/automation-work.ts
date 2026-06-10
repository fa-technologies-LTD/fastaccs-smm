import { sendLowStockAdminAlertIfNeeded } from '$lib/services/admin-alerts';
import { runAffiliateLifecycleEmailRecovery } from '$lib/services/affiliate-lifecycle-email';
import { generateMissingExactPreviewThumbnails } from '$lib/services/exact-preview-thumbnails';
import { runOnboardingAutomation } from '$lib/services/lifecycle-email';
import { runWinBackCampaign } from '$lib/services/winback';
import type { AutomationJobName } from '$lib/server/automation-jobs';

const MANUAL_AUTOMATION_WORK = {
	'exact-preview-thumbnails': () => generateMissingExactPreviewThumbnails({ limit: 6 }),
	'low-stock-alerts': () => sendLowStockAdminAlertIfNeeded('admin_manual_low_stock'),
	onboarding: () => runOnboardingAutomation({ limit: 300 }),
	'affiliate-lifecycle': () => runAffiliateLifecycleEmailRecovery(300),
	winback: runWinBackCampaign
} as const satisfies Partial<Record<AutomationJobName, () => Promise<unknown>>>;

export type ManualAutomationJobName = keyof typeof MANUAL_AUTOMATION_WORK;

export function isManualAutomationJobName(value: string): value is ManualAutomationJobName {
	return value in MANUAL_AUTOMATION_WORK;
}

export function getManualAutomationWork(jobName: ManualAutomationJobName): () => Promise<unknown> {
	return MANUAL_AUTOMATION_WORK[jobName];
}

export function getManuallyRunnableAutomationJobs(): ManualAutomationJobName[] {
	return Object.keys(MANUAL_AUTOMATION_WORK) as ManualAutomationJobName[];
}
