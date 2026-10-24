import { describe, expect, it } from 'vitest';
import {
	formatBoostingHealthReport,
	offerLabel,
	type BoostingHealthReport
} from './boosting-health-report';

const base: BoostingHealthReport = {
	windowHours: 12,
	generatedAt: new Date('2026-10-24T19:01:00Z'),
	orders: { newOrders: 4, delivered: 3, inProgress: 2, manualReview: 0 },
	oldestInProgressHours: 5,
	stuck: [],
	manualReview: [],
	failures: [],
	noRoute: [],
	notDelivering: [],
	unroutableOffers: [],
	complaints: {
		open: 0,
		oldestOpenHours: null,
		openedInWindow: 0,
		resolvedInWindow: 0,
		openByType: {}
	},
	retries: { inWindow: 0, deliveredAfterRetry: [], retryCostNgn: 0, retryEnabledOffers: 6 },
	learning: {
		liveServices: 79,
		servicesWithResults: 3,
		outcomesRecorded: 17,
		outcomesInWindow: 2,
		repeatedFailures: []
	},
	marginKeptNgn: 4_250,
	suppliers: [
		{
			label: 'SMM Raja',
			balance: 20.67,
			currency: 'USD',
			enabled: true,
			circuitOpen: false,
			pauseReason: null,
			balanceCheckedHoursAgo: 0
		}
	]
};

describe('Boosting check message', () => {
	it('a quiet, healthy period reads calmly with no warnings', () => {
		const text = formatBoostingHealthReport(base);
		expect(text).toContain('Boosting check · 24 Oct, 20:01 WAT · last 12 hours');
		expect(text).toContain('Orders: 4 new · 3 delivered');
		expect(text).toContain('Failures:\nNone in this period.');
		expect(text).toContain('Customer reports:\nNone.');
		expect(text).toContain('Margin kept on delivered orders: ₦4,250');
		expect(text).toContain('✅ SMM Raja: $20.67');
		expect(text).not.toContain('⚠');
	});

	it('marks everything that needs the owner with ⚠, and shows retries that worked', () => {
		const text = formatBoostingHealthReport({
			...base,
			stuck: [{ service: 'X followers · Affordable', provider: 'SMM Raja', hours: 114 }],
			manualReview: [{ service: 'Instagram Followers', reason: 'admin_link_requested', hours: 25 }],
			failures: [
				{ service: 'IG Followers #11524', provider: 'BulkFollows', outcome: 'cancelled', orders: 2 }
			],
			noRoute: [{ offer: 'Instagram Followers', orders: 1 }],
			notDelivering: [
				{
					service: 'S113 Twitter Followers #s5044',
					provider: 'SMM Raja',
					orders: 6,
					oldestHours: 114
				}
			],
			unroutableOffers: ['Instagram Followers'],
			complaints: {
				open: 1,
				oldestOpenHours: 15,
				openedInWindow: 1,
				resolvedInWindow: 0,
				openByType: { nothing_delivered: 1 }
			},
			retries: {
				inWindow: 1,
				retryCostNgn: 469,
				retryEnabledOffers: 6,
				deliveredAfterRetry: [
					{
						offer: 'X Likes',
						firstService: 'Likes #10 (SMM Raja)',
						finalService: 'Likes #22 (BulkFollows)'
					}
				]
			},
			learning: {
				...base.learning,
				repeatedFailures: [
					{ service: 'IG Followers #11524', provider: 'BulkFollows', failures: 2, score: 33 }
				]
			},
			suppliers: [
				{
					label: 'BulkFollows',
					balance: 5.06,
					currency: 'USD',
					enabled: true,
					circuitOpen: false,
					pauseReason: null,
					balanceCheckedHoursAgo: 0
				}
			]
		});
		expect(text).toContain('⚠ Stuck 4d 18h: X followers · Affordable (SMM Raja)');
		expect(text).toContain('⚠ Review (25h): Instagram Followers: customer link needs checking');
		expect(text).toContain('⚠ IG Followers #11524 (BulkFollows): 2 cancelled');
		expect(text).toContain('⚠ No supplier could take 1 order for Instagram Followers');
		expect(text).toContain(
			"⚠ S113 Twitter Followers #s5044 (SMM Raja): 6 orders with nothing delivered after 12+ hours (oldest 4d 18h). These don't count as failures in its track record yet."
		);
		expect(text).toContain(
			'⚠ On sale but no usable supplier: Instagram Followers (add a service or hide it)'
		);
		expect(text).toContain('⚠ 1 open (1 nothing delivered), oldest 15h · 1 new · 0 resolved');
		expect(text).toContain('Retries paid from margin: 1 (cost ₦469) · 1 delivered after a retry');
		expect(text).toContain(
			'✅ X Likes: Likes #10 (SMM Raja) failed → Likes #22 (BulkFollows) delivered'
		);
		expect(text).toContain(
			'⚠ IG Followers #11524 (BulkFollows) failed 2 times in a row · success 33%'
		);
		expect(text).toContain('⚠ BulkFollows: $5.06 (low)');
	});

	it('names offers by platform and outcome when the offer name is only a tier', () => {
		expect(offerLabel('x|followers|Affordable')).toBe('X followers · Affordable');
		expect(offerLabel('instagram|followers|Instagram Followers')).toBe('Instagram Followers');
		expect(offerLabel('Plain supplier name')).toBe('Plain supplier name');
	});
});
