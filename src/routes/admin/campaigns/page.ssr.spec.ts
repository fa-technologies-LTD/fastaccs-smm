import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import Page from './+page.svelte';
import { BIGSPENDER_DEFAULTS, REFER_WIN_DEFAULTS } from '$lib/helpers/promo-campaign-rules';

const summary = {
	issueNow: { count: 0, amount: 0 },
	waiting: { count: 0, amount: 0 },
	dropped: { count: 0, amount: 0 },
	heldIdentity: { count: 0, amount: 0 },
	superExcluded: { count: 11, amount: 11_000 },
	issued: { count: 0, amount: 0 },
	notYet: 20
};
const report = (campaign: string) => ({
	campaign,
	monthStart: new Date('2026-09-30T23:00:00.000Z'),
	monthEnd: new Date('2026-10-31T23:00:00.000Z'),
	issued: { count: 0, amount: 0 },
	returnedAfterRefund: { amount: 0 },
	spent: { orders: 0, amount: 0 },
	expired: { amount: 0 },
	reversed: { amount: 0 },
	refundedAfterSpendNotClawedBack: { count: 0, amount: 0 },
	outstandingNow: 0,
	cashOnPromoOrders: 0,
	goodsCostOnPromoOrders: 0,
	ordersMissingCost: 0,
	estimatedNetAfterGoods: 0
});

const data = (overrides: { isOwner?: boolean } = {}) => ({
	isOwner: overrides.isOwner ?? true,
	month: '2026-10',
	referWin: {
		settings: REFER_WIN_DEFAULTS,
		live: false,
		endsAtWat: '',
		startsAtWat: '',
		margin: { status: 'needs_costs', missing: ['Instagram · Aged'], checked: 24 },
		switchOnBlock: 'Refer & Win stays locked until every active account tier has a cost.',
		live_dry_run: { summary, rows: [] },
		illustrative: {
			summary: { ...summary, issueNow: { count: 1, amount: 1_000 } },
			withSuper: { ...summary, issueNow: { count: 4, amount: 4_000 } }
		},
		report: report('refer_win')
	},
	bigSpender: {
		settings: BIGSPENDER_DEFAULTS,
		live: false,
		endsAtWat: '',
		startsAtWat: '',
		targets: [
			{
				userId: 'u1',
				label: 'Ada',
				spendNow: 575_700,
				targetNgn: 600_000,
				toGo: 24_300,
				hadSpendGift70k: true,
				alreadyGranted: false
			}
		],
		report: report('bigspender')
	}
});

const html = (input: ReturnType<typeof data>) =>
	render(Page, { props: { data: input, form: null } as never }).body;

describe('admin campaigns page', () => {
	it('shows both campaigns OFF, locked until tier costs exist', () => {
		const body = html(data());
		expect(body).toContain('Refer &amp; Win');
		expect(body).toContain('BIGSPENDER');
		expect(body.match(/>OFF</g)?.length).toBe(2);
		expect(body).toContain('every active account tier has a cost');
		expect(body).toContain('Instagram · Aged');
	});

	it('shows the dry runs in naira with no backfill', () => {
		const body = html(data());
		expect(body).toContain('nobody');
		expect(body).toContain('never paid');
		expect(body).toContain('next round mark');
		expect(body).toContain('₦600,000');
		expect(body).toContain('Ada');
	});

	it('disables every control for admins who are not the owner', () => {
		const body = html(data({ isOwner: false }));
		expect(body).toContain('Only the owner can change these settings.');
		expect(body).not.toContain('Grant to existing customers');
		expect(body).toContain('disabled');
	});
});
