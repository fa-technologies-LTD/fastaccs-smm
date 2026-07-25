import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { hasAdminPermission } from '$lib/auth/admin-roles';
import { seedNumbersCatalog, updateNumbersTiers } from '$lib/services/phone-catalog';
import { savePhonePricingConfig } from '$lib/services/phone-pricing';

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
				marginPercent: body.marginPercent
			});
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
