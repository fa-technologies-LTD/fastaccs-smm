import { describe, expect, it } from 'vitest';
import {
	parseBoostComments,
	supportsBoostServiceInput,
	supportsSimpleBoostInput
} from './boosting-service-input';
describe('supported supplier input contracts', () => {
	it('supports custom text only for a custom-comments result, never a package or subscription', () => {
		expect(supportsBoostServiceInput('Custom Comments', 'custom_comments')).toBe(true);
		expect(supportsBoostServiceInput('Custom Comments', 'comments')).toBe(false);
		expect(supportsBoostServiceInput('Default', 'custom_comments')).toBe(false);
		expect(supportsBoostServiceInput('Custom Comments Package', 'custom_comments')).toBe(false);
		expect(supportsBoostServiceInput('Subscriptions', 'likes')).toBe(false);
	});
	it('counts non-empty lines without changing or inventing comments', () => {
		expect(parseBoostComments(' First!\r\n\r\nSecond! \nFirst!')).toEqual({
			text: 'First!\nSecond!\nFirst!',
			quantity: 3,
			error: null
		});
	});
	it.each([
		'',
		'x'.repeat(501),
		Array(501).fill('Hello').join('\n'),
		'Hello\u0000world',
		'x'.repeat(30_001)
	])('rejects invalid text without truncating it', (value) => {
		expect(parseBoostComments(value).error).toBeTruthy();
		expect(parseBoostComments(value).quantity).toBe(0);
	});
	it('accepts ordinary services without judging advertised quality', () => {
		expect(supportsSimpleBoostInput('Default')).toBe(true);
		expect(supportsSimpleBoostInput(null)).toBe(true);
	});
	it.each(['Custom Comments', 'Package', 'Subscriptions', 'Poll', 'Comment Likes'])(
		'rejects unsupported %s inputs rather than paying for an invalid request',
		(type) => {
			expect(supportsSimpleBoostInput(type)).toBe(false);
		}
	);
});
