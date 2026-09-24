import { describe, expect, it } from 'vitest';
import { getEmailRecipientNames, personalizeEmailTemplate } from './email-personalization';

describe('email personalization', () => {
	it('uses the registered first and full name in a template', () => {
		expect(
			personalizeEmailTemplate(
				'Hi {{first_name}}, your account belongs to {{full_name}}.',
				'  Tobi   Ade  '
			)
		).toBe('Hi Tobi, your account belongs to Tobi Ade.');
	});

	it('accepts placeholder spacing and casing', () => {
		expect(personalizeEmailTemplate('Hello {{ FIRST_NAME }}', 'Ada Lovelace')).toBe('Hello Ada');
	});

	it('uses a natural fallback when no name was registered', () => {
		expect(getEmailRecipientNames(null)).toEqual({ firstName: 'there', fullName: 'there' });
		expect(personalizeEmailTemplate('Hi {{first_name}}', '')).toBe('Hi there');
	});
});
