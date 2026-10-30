/**
 * Promo credit: one store-credit bucket shared by Refer & Win and BIGSPENDER. Kept separate from
 * refund credit and affiliate Cash. Spendable on any service, never withdrawable or transferable,
 * never part of a commission base. Each grant ("lot") has its own expiry; spending uses the
 * earliest-expiring credit first.
 */

export const PROMO_DEFAULT_CAP_PERCENT = 50;
export const PROMO_MAX_CAP_WITHOUT_OVERRIDE = 50;

export interface PromoLot {
	id: string;
	campaign: string;
	amount: number;
	createdAt: Date;
	expiresAt: Date;
}

export interface PromoDebit {
	amount: number;
	createdAt: Date;
	/** Spend recorded against specific lots (checkout records this). */
	lots?: ReadonlyArray<{ lotId: string; amount: number }>;
	/** Expiry/reversal of one lot. */
	lotId?: string | null;
}

export interface PromoLotBalance {
	id: string;
	campaign: string;
	amount: number;
	remaining: number;
	expiresAt: Date;
	expired: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function computePromoLotBalances(
	lots: ReadonlyArray<PromoLot>,
	debits: ReadonlyArray<PromoDebit>,
	now: Date = new Date()
): PromoLotBalance[] {
	const remaining = new Map(lots.map((lot) => [lot.id, Math.max(0, lot.amount)]));
	const take = (lotId: string, amount: number) => {
		const left = remaining.get(lotId);
		if (left === undefined) return 0;
		const used = Math.min(left, Math.max(0, amount));
		remaining.set(lotId, round2(left - used));
		return used;
	};
	const ordered = [...debits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
	for (const debit of ordered) {
		if (debit.lots && debit.lots.length > 0) {
			for (const part of debit.lots) take(part.lotId, part.amount);
		} else if (debit.lotId) {
			take(debit.lotId, debit.amount);
		} else {
			// Unallocated spend: earliest-expiring credit that was valid at the time.
			let left = Math.max(0, debit.amount);
			const valid = lots
				.filter((lot) => lot.createdAt <= debit.createdAt && lot.expiresAt > debit.createdAt)
				.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
			for (const lot of valid) {
				if (left <= 0) break;
				left = round2(left - take(lot.id, left));
			}
		}
	}
	return lots.map((lot) => ({
		id: lot.id,
		campaign: lot.campaign,
		amount: lot.amount,
		remaining: remaining.get(lot.id) ?? 0,
		expiresAt: lot.expiresAt,
		expired: lot.expiresAt <= now
	}));
}

export function promoAvailable(
	balances: ReadonlyArray<PromoLotBalance>,
	campaign?: string
): number {
	return round2(
		balances
			.filter((lot) => !lot.expired && (!campaign || lot.campaign === campaign))
			.reduce((sum, lot) => sum + lot.remaining, 0)
	);
}

/** Spendable promo credit per campaign (what checkout needs; no lot detail). */
export interface PromoCampaignBalance {
	campaign: string;
	available: number;
	/** Earliest expiry among this campaign's unspent credit (ISO), for display. */
	nextExpiresAt: string | null;
}

export function promoBalancesByCampaign(
	balances: ReadonlyArray<PromoLotBalance>
): PromoCampaignBalance[] {
	const byCampaign = new Map<string, PromoCampaignBalance>();
	for (const lot of balances) {
		if (lot.expired || lot.remaining <= 0) continue;
		const entry = byCampaign.get(lot.campaign) ?? {
			campaign: lot.campaign,
			available: 0,
			nextExpiresAt: null
		};
		entry.available = round2(entry.available + lot.remaining);
		const expiry = lot.expiresAt.toISOString();
		if (!entry.nextExpiresAt || expiry < entry.nextExpiresAt) entry.nextExpiresAt = expiry;
		byCampaign.set(lot.campaign, entry);
	}
	return [...byCampaign.values()];
}

/** Most of an order (after discounts) that promo credit may pay. */
export function promoCapAmount(orderTotal: number, capPercent: number): number {
	const percent = Number.isFinite(capPercent) ? Math.min(100, Math.max(0, capPercent)) : 0;
	return Math.max(0, Math.floor((Math.max(0, orderTotal) * percent) / 100));
}

function capFor(campaign: string, caps: Readonly<Record<string, number>> | undefined): number {
	const cap = caps?.[campaign];
	return typeof cap === 'number' && Number.isFinite(cap) ? cap : PROMO_DEFAULT_CAP_PERCENT;
}

/**
 * Most promo credit one order may use: each campaign's credit up to that campaign's cap, and
 * all promo credit together never more than the most generous cap among the credit held.
 */
export function promoSpendableForOrder(
	orderTotal: number,
	balances: ReadonlyArray<Pick<PromoCampaignBalance, 'campaign' | 'available'>>,
	caps?: Readonly<Record<string, number>>
): number {
	let sum = 0;
	let highestCap = 0;
	for (const entry of balances) {
		const available = Math.max(0, Math.floor(Number(entry.available) || 0));
		if (available <= 0) continue;
		const cap = capFor(entry.campaign, caps);
		highestCap = Math.max(highestCap, cap);
		sum += Math.min(available, promoCapAmount(orderTotal, cap));
	}
	return Math.min(sum, promoCapAmount(orderTotal, highestCap));
}

/**
 * Which lots a spend of `amount` should come from: earliest expiry first, whole naira, and no
 * campaign beyond its own cap on this order.
 */
export function allocatePromoSpend(
	balances: ReadonlyArray<PromoLotBalance>,
	amount: number,
	options: { orderTotal?: number; caps?: Readonly<Record<string, number>> } = {}
): Array<{ lotId: string; amount: number }> {
	let left = Math.max(0, Math.floor(amount));
	const usedByCampaign = new Map<string, number>();
	const parts: Array<{ lotId: string; amount: number }> = [];
	for (const lot of [...balances]
		.filter((entry) => !entry.expired && entry.remaining > 0)
		.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())) {
		if (left <= 0) break;
		const campaignRoom =
			options.orderTotal === undefined
				? Infinity
				: promoCapAmount(options.orderTotal, capFor(lot.campaign, options.caps)) -
					(usedByCampaign.get(lot.campaign) ?? 0);
		const used = Math.min(left, Math.floor(lot.remaining), Math.max(0, campaignRoom));
		if (used > 0) {
			parts.push({ lotId: lot.id, amount: used });
			usedByCampaign.set(lot.campaign, (usedByCampaign.get(lot.campaign) ?? 0) + used);
			left -= used;
		}
	}
	return parts;
}
