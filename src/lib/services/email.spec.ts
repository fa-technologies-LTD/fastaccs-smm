import { describe, expect, it } from 'vitest';
import { renderEmailTemplate, resolveEmailLogoUrl } from './email';

describe('email template header', () => {
	it('renders the brand outside the bordered email card', () => {
		const html = renderEmailTemplate({
			body: '<p>Test email body</p>',
			showCta: false
		});

		const brandPosition = html.indexOf('alt="FAST ACCOUNTS"');
		const cardPosition = html.indexOf(
			'background:#141414;border-radius:14px;border:1px solid #2B2F33'
		);

		expect(brandPosition).toBeGreaterThan(-1);
		expect(cardPosition).toBeGreaterThan(brandPosition);
		expect(html).toContain('padding:0 0 18px 0;line-height:1;');
		expect(html).toContain('color:#25B570;font-size:22px;font-weight:800;');
	});

	it('keeps the body and CTA inside the bordered card', () => {
		const html = renderEmailTemplate({
			body: '<p>Test email body</p>',
			ctaText: 'Open Fast Accounts',
			ctaUrl: 'https://fastaccs.com/platforms',
			showCta: true
		});

		const cardPosition = html.indexOf(
			'background:#141414;border-radius:14px;border:1px solid #2B2F33'
		);
		const bodyPosition = html.indexOf('<p>Test email body</p>');
		const ctaPosition = html.indexOf('Open Fast Accounts');

		expect(bodyPosition).toBeGreaterThan(cardPosition);
		expect(ctaPosition).toBeGreaterThan(cardPosition);
	});

	it('embeds the header image so email clients do not need to fetch it externally', () => {
		const html = renderEmailTemplate({
			body: '<p>Test email body</p>',
			showCta: false
		});

		expect(html).toContain('src="cid:fastaccounts-email-header"');
		expect(html).not.toContain('localhost');
		expect(html).not.toContain('fastaccs.vercel.app');
		expect(html).not.toContain('/fa-email-logo.png');
	});

	it('rejects unsafe logo base URLs in favor of the canonical SMM domain', () => {
		expect(resolveEmailLogoUrl('http://localhost:5173')).toBe(
			'https://smm.fastaccs.com/fa-email-logo.png'
		);
		expect(resolveEmailLogoUrl('not-a-url')).toBe('https://smm.fastaccs.com/fa-email-logo.png');
	});
});
