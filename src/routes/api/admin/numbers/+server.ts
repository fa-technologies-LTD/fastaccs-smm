import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import {
	seedNumbersCatalog,
	syncNumbersCatalog,
	updateNumbersTiers
} from '$lib/services/phone-catalog';
import { savePhonePricingConfig } from '$lib/services/phone-pricing';
import { launchNumbersCampaign, stopNumbersCampaign } from '$lib/services/numbers-campaign';

function guard(locals: App.Locals): boolean {
	return Boolean(
		locals.adminContext && hasAdminPermission(locals.adminContext, 'admin:catalog:manage')
	);
}

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!guard(locals)) {
		return json({ success: false, error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => ({}));
	const action = String(body.action || '');

	try {
		if (action === 'seed') {
			// "Refresh costs" — cost/price refresh only; keeps the curated set frozen.
			const result = await syncNumbersCatalog();
			return json({ success: true, ...result });
		}

		if (action === 'expand') {
			// "Expand catalog" — add any currently-available combos not yet in the set.
			const result = await seedNumbersCatalog();
			return json({ success: true, ...result });
		}

		if (action === 'save') {
			const updates = Array.isArray(body.updates) ? body.updates : [];
			await updateNumbersTiers(updates);
			return json({ success: true });
		}

		if (action === 'config') {
			await savePhonePricingConfig({
				usdNgnRate: body.usdNgnRate,
				marginPercent: body.marginPercent,
				minProfitNgn: body.minProfitNgn,
				maxPriceMultiple: body.maxPriceMultiple,
				minFulfillmentProfitNgn: body.minFulfillmentProfitNgn,
				otpReplacementWaitSeconds: body.otpReplacementWaitSeconds
			});
			// Recompute every tier's automatic price from the new rate/margin right away.
			await syncNumbersCatalog();
			return json({ success: true });
		}

		// Launch requires the owner (not just catalog managers) — it emails everyone,
		// retires the manual tiers, and fires push. Gated to admin:access + owner role.
		if (action === 'launch-campaign') {
			if (!hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
				return json({ success: false, error: 'Owner only' }, { status: 403 });
			}
			const result = await launchNumbersCampaign();
			return json({ success: true, ...result });
		}

		if (action === 'stop-campaign') {
			if (!hasAdminPermission(locals.adminContext, 'admin:settings:manage')) {
				return json({ success: false, error: 'Owner only' }, { status: 403 });
			}
			await stopNumbersCampaign();
			return json({ success: true });
		}

		return json({ success: false, error: 'Unknown action' }, { status: 400 });
	} catch (error) {
		console.error('[admin.numbers] action failed:', error);
		return json(
			{ success: false, error: error instanceof Error ? error.message : 'Action failed' },
			{ status: 500 }
		);
	}
};
