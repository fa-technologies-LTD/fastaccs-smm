import { describe, it, expect, vi } from 'vitest';

// phone-pricing pulls env + prisma at import for config I/O; the pure math under test needs neither.
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/prisma', () => ({ prisma: {} }));

import { computeAutoPrice, computeMaxRentCents } from './phone-pricing';

const CFG = { usdNgnRate: 1500, marginPercent: 120, minProfitNgn: 1000, maxPriceMultiple: 2.5 };

describe('computeAutoPrice — margin collar', () => {
	it('cheap tier: the ₦1,000 profit floor wins (competitive baseline)', () => {
		// $0.50 basis → cost ₦750; margin ₦1,650→1,700, floor ₦1,750→1,800, cap ₦1,875→1,900. Floor wins.
		expect(computeAutoPrice(50, CFG)).toBe(1800);
	});

	it('mid tier: the percentage margin drives the price (inside the collar)', () => {
		// $2.00 basis, 100% margin → cost ₦3,000; margin ₦6,000, floor ₦4,000, cap ₦7,500 → margin wins.
		expect(computeAutoPrice(200, { ...CFG, marginPercent: 100 })).toBe(6000);
	});

	it('high margin: the 2.5× cap binds (keeps a mid-cost tier competitive)', () => {
		// $1.00 basis, 400% margin → margin ₦7,500 but cap 2.5×₦1,500 = ₦3,800 → cap wins.
		expect(computeAutoPrice(100, { ...CFG, marginPercent: 400 })).toBe(3800);
	});

	it('very cheap tier: floor wins even though the cap would be below it (§28 safety)', () => {
		// $0.10 basis → cost ₦150; cap 2.5×150 = ₦375 (below the ₦1,000 min profit). Floor must win.
		expect(computeAutoPrice(10, CFG)).toBe(1200); // cost ₦150 + ₦1,000, rounded up to ₦100
	});
});

describe('computeMaxRentCents — delivery ceiling', () => {
	it('adds the allowed rescue loss on top of the sale price', () => {
		// sale ₦1,800 + ₦1,000 loss = ₦2,800 → 2800/1500*100 = 186¢
		expect(computeMaxRentCents(1800, 1000, 1500)).toBe(186);
	});

	it('collapses to break-even when the rescue budget is exhausted (allowedLoss 0)', () => {
		expect(computeMaxRentCents(1800, 0, 1500)).toBe(120); // 1800/1500*100
	});

	it('never returns below 1 cent', () => {
		expect(computeMaxRentCents(0, 0, 1500)).toBe(1);
	});
});
