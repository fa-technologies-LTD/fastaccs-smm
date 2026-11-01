import type { PrismaClient } from '@prisma/client';
import { bulkFollowsClient } from './bulk-follows';
import { smmRajaClient } from './smm-raja';
import type { BoostProviderReadClient } from './types';
import type {
	BoostBalanceProvider,
	BoostSupplierBalance
} from '$lib/helpers/boosting-supplier-balances';

/** Balance inspection only. No catalogue sync, database writes, pricing or supplier orders. */
export async function readBoostSupplierBalances(
	provider?: BoostBalanceProvider,
	clients: BoostProviderReadClient[] = [smmRajaClient, bulkFollowsClient]
): Promise<BoostSupplierBalance[]> {
	return Promise.all(
		clients
			.filter((client) => !provider || client.id === provider)
			.map(async (client) => {
				const base = {
					id: client.id,
					label: client.label,
					configured: client.isConfigured(),
					balance: null,
					currency: null,
					checkedAt: null,
					error: null
				};
				if (!base.configured) return base;
				try {
					const result = await client.getBalance();
					if (
						!Number.isFinite(result.amount) ||
						result.amount < 0 ||
						!/^[A-Z]{3}$/.test(result.currency)
					)
						throw new Error('Invalid balance');
					return {
						...base,
						balance: result.amount,
						currency: result.currency,
						checkedAt: new Date().toISOString()
					};
				} catch {
					// Never include upstream payloads, credentials or transport details in the UI.
					return { ...base, error: 'Balance could not refresh. Try again.' };
				}
			})
	);
}

/**
 * Records each supplier's live balance, so paid orders waiting on a top-up see it without a full catalogue
 * sync. Like the sync, the reported balance replaces the projected one.
 */
export async function recordBoostSupplierBalances(
	database: Pick<PrismaClient, 'boostProviderState'>,
	clients: BoostProviderReadClient[] = [smmRajaClient, bulkFollowsClient]
): Promise<BoostSupplierBalance[]> {
	const balances = await readBoostSupplierBalances(undefined, clients);
	for (const read of balances) {
		if (read.balance === null || !read.currency || !read.checkedAt) continue;
		await database.boostProviderState.updateMany({
			where: { provider: read.id },
			data: {
				balance: read.balance,
				projectedBalance: read.balance,
				currency: read.currency,
				lastBalanceSuccessAt: new Date(read.checkedAt)
			}
		});
	}
	return balances;
}
