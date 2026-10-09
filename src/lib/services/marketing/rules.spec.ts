import { describe, it, expect } from 'vitest';
import { decide, DEFAULT_THRESHOLDS } from './rules';

describe('decide', () => {
	const cases: Array<{
		name: string;
		spendNgn: number;
		buyers: number;
		action: string;
		cacNgn: number | null;
	}> = [
		{ name: 'no spend', spendNgn: 0, buyers: 0, action: 'hold', cacNgn: null },
		{ name: 'early, no buyers', spendNgn: 5000, buyers: 0, action: 'hold', cacNgn: null },
		{
			name: 'kill limit reached, no buyers',
			spendNgn: 8000,
			buyers: 0,
			action: 'kill',
			cacNgn: null
		},
		{ name: 'on target, too few buyers', spendNgn: 5000, buyers: 2, action: 'hold', cacNgn: 2500 },
		{ name: 'on target, enough buyers', spendNgn: 7800, buyers: 3, action: 'scale', cacNgn: 2600 },
		{
			name: 'above target, below ceiling',
			spendNgn: 12000,
			buyers: 3,
			action: 'prune',
			cacNgn: 4000
		},
		{
			name: 'above ceiling, small spend',
			spendNgn: 6000,
			buyers: 1,
			action: 'prune',
			cacNgn: 6000
		},
		{
			name: 'above ceiling, past kill limit',
			spendNgn: 18000,
			buyers: 3,
			action: 'kill',
			cacNgn: 6000
		}
	];

	for (const c of cases) {
		it(c.name, () => {
			const result = decide({ spendNgn: c.spendNgn, buyers: c.buyers });
			expect(result.action).toBe(c.action);
			expect(result.cacNgn).toBe(c.cacNgn);
			expect(result.reason.length).toBeGreaterThan(0);
		});
	}

	it('treats bad input as zero instead of throwing', () => {
		expect(decide({ spendNgn: Number.NaN, buyers: -2 }).action).toBe('hold');
		expect(decide({ spendNgn: -500, buyers: 1 }).action).toBe('hold');
	});

	it('respects custom thresholds', () => {
		const strict = { ...DEFAULT_THRESHOLDS, killAtNgn: 3000 };
		expect(decide({ spendNgn: 3000, buyers: 0 }, strict).action).toBe('kill');
	});

	it('explains decisions in naira', () => {
		expect(decide({ spendNgn: 8000, buyers: 0 }).reason).toContain('₦8,000');
	});
});
