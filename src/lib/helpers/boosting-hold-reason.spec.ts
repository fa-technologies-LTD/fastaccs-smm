import { expect, it } from 'vitest';
import { boostHoldReasons } from './boosting-hold-reason';
it('shows recorded low funds instead of claiming a missing mapping', () => {
	expect(
		boostHoldReasons('no_safe_route', {
			projections: [{ reasons: ['insufficient_balance', 'insufficient_balance'] }]
		})
	).toEqual(['The recorded supplier balance is insufficient after its safety reserve.']);
});
it('never displays arbitrary supplier text or assumes no mapping when evidence is absent', () => {
	expect(boostHoldReasons('secret-token', { raw: 'do not show' }).join(' ')).not.toMatch(
		/secret-token|do not show/
	);
	expect(boostHoldReasons('no_safe_route')[0]).toContain('Detailed reasons were not recorded');
	expect(boostHoldReasons(null)).toEqual([]);
	expect(boostHoldReasons('submission_unknown')[0]).toContain('do not submit again');
});
