import { describe, expect, it } from 'vitest';
import { parseCsvText } from './csv';

describe('csv parser', () => {
	it('parses custom-header CSV rows with quoted commas', () => {
		const parsed = parseCsvText(
			[
				'email,password,token_url,custom_note',
				'"buyer@example.com","my,pass","https://example.com/t?k=1,2","first row"',
				'"alt@example.com","second-pass","https://example.com/2fa",""'
			].join('\n')
		);

		expect(parsed.headers).toEqual(['email', 'password', 'token_url', 'custom_note']);
		expect(parsed.rows).toHaveLength(2);
		expect(parsed.rows[0].values).toEqual([
			'buyer@example.com',
			'my,pass',
			'https://example.com/t?k=1,2',
			'first row'
		]);
	});
});
