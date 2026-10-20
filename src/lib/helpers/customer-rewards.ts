/** What a customer can use or work towards right now (dashboard rewards strip). Shared types only. */
export interface CustomerRewards {
	firstOrderOffer: { code: string; label: string } | null;
	bigSpender: { rewardNgn: number; targetNgn: number; toGo: number } | null;
	referWin: { rewardNgn: number; qualifyingCashNgn: number } | null;
}
