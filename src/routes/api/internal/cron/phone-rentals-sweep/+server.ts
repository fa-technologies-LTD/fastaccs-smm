import type { RequestHandler } from './$types';
import { runAuthorizedAutomationCron } from '$lib/server/automation-cron';
import { checkHubmanBalanceAndAlert, reconcilePhoneShadows } from '$lib/services/phone-fulfillment';
import { sweepExpiredPhoneRentals } from '$lib/services/phone-rental-sweep';

// A pending rental in the sweep kicks off a rent (~9s); several in one run add up, so give the
// cron headroom to never be killed mid-rent (which would orphan a paid-for number).
export const config = { maxDuration: 60 };

// Bounded oldest-first safety net behind the live client polling: resolves OTPs and auto-cancels +
// refunds due Numbers rentals whose activation window has closed with no code.
// Also alerts (once/day) when the hub-man balance runs low.
export const GET: RequestHandler = async ({ request }) =>
	runAuthorizedAutomationCron({
		request,
		jobName: 'phone-rentals-sweep',
		work: async () => {
			const sweep = await sweepExpiredPhoneRentals();
			// Reconcile abandoned "shadow" pvapins numbers (detect late charges / leakage). Best-effort
			// + observational — never blocks the sweep.
			const shadows = await reconcilePhoneShadows().catch(() => ({ reconciled: 0, leaked: 0 }));
			await checkHubmanBalanceAndAlert();
			return { ...sweep, shadowsReconciled: shadows.reconciled, shadowsLeaked: shadows.leaked };
		}
	});
