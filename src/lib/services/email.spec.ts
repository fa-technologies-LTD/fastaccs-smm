import { describe, expect, it } from 'vitest';
import { renderEmailBody, renderEmailTemplate, resolveEmailLogoUrl } from './email';

describe('email template header', () => {
	it('renders the brand outside the bordered email card', () => {
		const html = renderEmailTemplate({
			body: '<p>Test email body</p>',
			title: 'A useful update',
			eyebrow: 'ORDER UPDATE',
			showCta: false
		});

		const brandPosition = html.indexOf('alt="FAST ACCOUNTS — ALL SOCIALS. ONE PLUG."');
		const cardPosition = html.indexOf(
			'background:#0e1713;border-radius:16px;border:1px solid #234435'
		);

		expect(brandPosition).toBeGreaterThan(-1);
		expect(cardPosition).toBeGreaterThan(brandPosition);
		expect(html).toContain('padding:0 0 16px 0;line-height:1;');
		expect(html).toContain('color:#25B570;font-size:22px;font-weight:800;');
		expect(html).toContain('A useful update');
		expect(html).toContain('ORDER UPDATE');
	});

	it('keeps the body and CTA inside the bordered card', () => {
		const html = renderEmailTemplate({
			body: '<p>Test email body</p>',
			title: 'Open your order',
			ctaText: 'Open Fast Accounts',
			ctaUrl: 'https://fastaccs.com/platforms',
			showCta: true
		});

		const cardPosition = html.indexOf(
			'background:#0e1713;border-radius:16px;border:1px solid #234435'
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
		expect(html).toContain('ALL SOCIALS. ONE PLUG.');
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

	it('adds a mobile-safe preheader and keeps the generated shell structurally balanced', () => {
		const html = renderEmailTemplate({
			body: '<p>Payment received.</p>',
			preheader: 'Order confirmed <FA-123>',
			showCta: false
		});

		expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1" />');
		expect(html).toContain('Order confirmed &lt;FA-123&gt;');
		expect(html.match(/<table\b/g)?.length).toBe(html.match(/<\/table>/g)?.length);
		expect(html.match(/<tr\b/g)?.length).toBe(html.match(/<\/tr>/g)?.length);
		expect(html.match(/<td\b/g)?.length).toBe(html.match(/<\/td>/g)?.length);
		expect(html).toContain('@media only screen and (max-width: 620px)');
	});

	it('does not render a CTA for an unsafe action URL', () => {
		const html = renderEmailTemplate({
			body: '<p>Account update.</p>',
			ctaText: 'Open account',
			ctaUrl: 'javascript:alert(1)',
			showCta: true
		});

		expect(html).not.toContain('javascript:');
		expect(html).not.toContain('Open account');
	});

	it('renders an escaped high-visibility value when an email needs one', () => {
		const html = renderEmailTemplate({
			body: '<p>Enter this code.</p>',
			title: 'Confirm your email',
			highlight: '123<456',
			highlightLabel: 'YOUR CODE',
			showCta: false
		});

		expect(html).toContain('YOUR CODE');
		expect(html).toContain('123&lt;456');
		expect(html).not.toContain('123<456');
	});

	it('renders mixed headings and bullet lines without exposing markdown-like jumble', () => {
		const html = renderEmailBody(`**Order Details:**
- Order Number: FA-123
- Total Amount: ₦5,800

Open your dashboard for the full details.`);

		expect(html).toContain('<p');
		expect(html).toContain('<strong>Order Details:</strong>');
		expect(html).toContain('<ul');
		expect(html).toContain(
			'<li style="margin:0 0 9px 0;padding-left:2px;">Order Number: FA-123</li>'
		);
		expect(html).not.toContain('<br>- Order Number');
	});

	it('renders both dash and dot bullets as one clean list', () => {
		const html = renderEmailBody('- Accounts\n• Numbers\n• Boosting');

		expect(html.match(/<ul\b/g)).toHaveLength(1);
		expect(html.match(/<li\b/g)).toHaveLength(3);
		expect(html).not.toContain('• Numbers');
	});

	it('groups important order facts into a compact summary', () => {
		const html = renderEmailBody('Order: FA-123\nAmount paid: ₦5,800\n\nYour payment is safe.');

		expect(html).toContain('role="presentation"');
		expect(html).toContain('Order</td>');
		expect(html).toContain('FA-123</td>');
		expect(html).toContain('Amount paid</td>');
		expect(html).toContain('₦5,800</td>');
	});

	it('escapes customer and operator values before formatting them', () => {
		const html = renderEmailBody('Name: <script>alert(1)</script>\n- Note: **safe**');

		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('<strong>safe</strong>');
	});
});
