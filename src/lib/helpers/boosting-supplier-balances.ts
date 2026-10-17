export const BOOST_BALANCE_PROVIDERS = [
	{ id: 'smm_raja', label: 'SMM Raja' },
	{ id: 'bulk_follows', label: 'BulkFollows' }
] as const;

export type BoostBalanceProvider = (typeof BOOST_BALANCE_PROVIDERS)[number]['id'];
export interface BoostSupplierBalance {
	id: BoostBalanceProvider;
	label: string;
	configured: boolean;
	balance: number | null;
	currency: string | null;
	checkedAt: string | null;
	error: string | null;
}
