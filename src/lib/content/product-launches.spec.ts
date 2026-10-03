import { describe, expect, it } from 'vitest';
import {
	BOOSTING_REFRESH_ANNOUNCEMENT,
	NUMBERS_IMPROVED_ANNOUNCEMENT,
	PRODUCT_LAUNCH_EMAIL_DRAFTS
} from './product-launches';

describe('product launch copy', () => {
	it('provides one popup and one editable email draft for each launch', () => {
		expect(NUMBERS_IMPROVED_ANNOUNCEMENT.secondaryHref).toBe('/numbers');
		expect(BOOSTING_REFRESH_ANNOUNCEMENT.secondaryHref).toBe('/services');
		expect(PRODUCT_LAUNCH_EMAIL_DRAFTS.map((draft) => draft.id)).toEqual([
			'numbers_improved',
			'boosting_refresh'
		]);
	});

	it('does not claim paid Boosting fulfilment is fully automated before live mode', () => {
		const allCopy = [
			BOOSTING_REFRESH_ANNOUNCEMENT.title,
			BOOSTING_REFRESH_ANNOUNCEMENT.body,
			...PRODUCT_LAUNCH_EMAIL_DRAFTS.flatMap((draft) => [draft.subject, draft.body])
		].join(' ');

		expect(allCopy).not.toMatch(/fully automated/i);
	});
});
