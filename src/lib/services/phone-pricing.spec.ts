import { describe, it, expect, vi } from 'vitest';

// phone-pricing pulls env + prisma at import for config I/O; the pure math under test needs neither.
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/prisma', () => ({ prisma: {} }));

import { computeAutoPrice, computeProcurementCeilingCents } from './phone-pricing';

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

describe('computeProcurementCeilingCents — hard ₦500 fulfilment floor', () => {
	it('is sale − ₦500 profit, converted to USD cents (no loss, ever)', () => {
		// ₦1,800 − ₦500 = ₦1,300 budget → 1300/1500*100 = 86¢ (≈ $0.86)
		expect(computeProcurementCeilingCents(1800, 500, 1500)).toBe(86);
	});

	it('a manually-locked high price gives more procurement headroom', () => {
		// ₦5,500 − ₦500 = ₦5,000 → 5000/1500*100 = 333¢ (≈ $3.33)
		expect(computeProcurementCeilingCents(5500, 500, 1500)).toBe(333);
	});

	it('returns 0 (unfulfillable — refund, never a loss) when the sale cannot clear the floor', () => {
		expect(computeProcurementCeilingCents(500, 500, 1500)).toBe(0);
		expect(computeProcurementCeilingCents(400, 500, 1500)).toBe(0);
	});
});
