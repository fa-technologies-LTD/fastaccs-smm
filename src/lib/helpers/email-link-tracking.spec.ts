import { describe, expect, it } from 'vitest';
import {
	emailUtmContent,
	shouldTagEmailLinks,
	tagEmailBodyLinks,
	tagEmailLink
} from './email-link-tracking';

const options = { siteHosts: ['smm.fastaccs.com'], campaign: 'nurture_step', content: 'step_1' };

describe('email link tracking', () => {
	it('tags marketing and reminder emails, never order, security or affiliate emails', () => {
		expect(shouldTagEmailLinks('nurture_step')).toBe(true);
		expect(shouldTagEmailLinks('admin_broadcast')).toBe(true);
		expect(shouldTagEmailLinks('anything', 'marketing')).toBe(true);
		expect(shouldTagEmailLinks('order_confirmation', 'transactional')).toBe(false);
		expect(shouldTagEmailLinks('password_reset', 'transactional')).toBe(false);
		expect(shouldTagEmailLinks('affiliate_payout', 'transactional')).toBe(false);
	});

	it('names the email in a sequence without identifying the person', () => {
		expect(emailUtmContent('nurture:step_2:11111111-1111-4111-8111-111111111111')).toBe('step_2');
		expect(emailUtmContent(null, 'abcdef12-3456-4789-8abc-def012345678')).toBe('b-abcdef12');
		expect(
			emailUtmContent(
				'store-credit-reminder:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222'
			)
		).toBe('');
	});

	it('adds tags to our own links only, and never overwrites existing tags', () => {
		expect(tagEmailLink('https://smm.fastaccs.com/platforms', options)).toBe(
			'https://smm.fastaccs.com/platforms?utm_source=email&utm_medium=email&utm_campaign=nurture_step&utm_content=step_1'
		);
		expect(tagEmailLink('https://wa.me/234000', options)).toBe('https://wa.me/234000');
		expect(tagEmailLink('https://smm.fastaccs.com/x?utm_source=snapchat', options)).toBe(
			'https://smm.fastaccs.com/x?utm_source=snapchat'
		);
	});

	it('tags our links inside the email text too', () => {
		expect(
			tagEmailBodyLinks(
				'See [prices](https://smm.fastaccs.com/platforms) or [help](https://wa.me/1)',
				options
			)
		).toBe(
			'See [prices](https://smm.fastaccs.com/platforms?utm_source=email&utm_medium=email&utm_campaign=nurture_step&utm_content=step_1) or [help](https://wa.me/1)'
		);
	});
});
