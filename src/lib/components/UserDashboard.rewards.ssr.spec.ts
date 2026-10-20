import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import UserDashboard from './UserDashboard.svelte';

const html = (props: Record<string, unknown>) =>
	render(UserDashboard, { props: { user: { id: 'u1', email: 'a@x.test' }, ...props } as never })
		.body;

describe('dashboard rewards strip', () => {
	it('stays hidden when nothing applies', () => {
		expect(html({ rewards: null, storeCredit: { totalAvailable: 0 } })).not.toContain(
			'Your rewards'
		);
	});

	it('shows promo credit with its expiry, the first-order offer, BIGSPENDER progress and Refer & Win', () => {
		const body = html({
			storeCredit: {
				totalAvailable: 1_000,
				promoAvailable: 1_000,
				promo: [
					{ campaign: 'refer_win', available: 1_000, nextExpiresAt: '2026-11-19T10:00:00.000Z' }
				]
			},
			rewards: {
				firstOrderOffer: { code: 'WELCOME10', label: '10% off your first account order' },
				bigSpender: { rewardNgn: 3_000, targetNgn: 100_000, toGo: 12_000 },
				referWin: { rewardNgn: 1_000, qualifyingCashNgn: 5_000 }
			}
		});
		expect(body).toContain('Your rewards');
		expect(body).toContain('₦1,000 promo credit · use by 19 Nov — applied at checkout');
		expect(body).toContain('10% off your first account order — one tap at checkout (WELCOME10)');
		expect(body).toContain('Spend ₦12,000 more to get ₦3,000 store credit');
		expect(body).toContain('Refer a friend: get ₦1,000 credit when they spend ₦5,000');
	});
});
