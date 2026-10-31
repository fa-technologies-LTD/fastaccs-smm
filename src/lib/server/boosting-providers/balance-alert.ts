import type { PrismaClient } from '@prisma/client';
import { prisma } from '$lib/prisma';
import { sendCriticalAdminAlert } from '$lib/services/admin-alerts';

type AlertSender = typeof sendCriticalAdminAlert;
type StateReader = Pick<PrismaClient, 'boostProviderState'>;

function positive(value: string | undefined, fallback: number) {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : fallback;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Like Numbers' hub-man alert: at most once every 24 h per supplier, tell the operators when a Boosting supplier's
 * balance falls below its safety reserve plus a working float. Offers stop selling when the balance
 * cannot cover an order after the reserve, so this is the one place that warning belongs, not every
 * offer row. Never throws; a failed check simply tries again on the next run.
 */
export async function alertLowBoostSupplierBalances(
	options: { database?: StateReader; send?: AlertSender } = {}
): Promise<string[]> {
	const database = options.database ?? prisma;
	const send = options.send ?? sendCriticalAdminAlert;
	const reserve = positive(process.env.BOOSTING_BALANCE_SAFETY_USD, 5);
	const alertBelow = positive(process.env.BOOSTING_LOW_BALANCE_ALERT_USD, reserve + 10);
	const alerted: string[] = [];
	try {
		const states = await database.boostProviderState.findMany({
			select: {
				provider: true,
				label: true,
				balance: true,
				projectedBalance: true,
				lastBalanceSuccessAt: true
			}
		});
		for (const state of states) {
			// Only a balance the supplier actually reported counts; an unreadable one is not "low".
			if (!state.lastBalanceSuccessAt) continue;
			const amount = Number(state.projectedBalance ?? state.balance);
			if (!Number.isFinite(amount) || amount >= alertBelow) continue;
			const name = state.label || state.provider;
			await send({
				title: `${name} needs funding`,
				message: `Boosting supplier ${name} has $${amount.toFixed(2)} left. Offers stop selling once the balance can’t cover an order after the $${reserve.toFixed(2)} safety reserve. Top up to keep Boosting orders flowing.`,
				source: 'boosting.balance',
				// The shared alert cooldown is 30 min, so the 24 h has to be asked for here.
				dedupeKey: `boost-low-balance:${state.provider}`,
				cooldownMs: DAY_MS,
				ctaText: 'Open Boosting',
				ctaUrl: 'https://smm.fastaccs.com/admin/boosting'
			}).catch(() => {});
			alerted.push(state.provider);
		}
	} catch {
		// The balance alert is a convenience; it must never fail the job that called it.
	}
	return alerted;
}
