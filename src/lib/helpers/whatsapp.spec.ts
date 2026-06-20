import { describe, expect, it } from 'vitest';
import { buildWhatsAppSupportLink, normalizeWhatsAppNumber } from './whatsapp';

describe('normalizeWhatsAppNumber', () => {
	it('strips non-digit characters', () => {
		expect(normalizeWhatsAppNumber('+234 801 234 5678')).toBe('2348012345678');
	});

	it('strips a leading 00 international prefix', () => {
		expect(normalizeWhatsAppNumber('00234 801 234 5678')).toBe('2348012345678');
	});

	it('returns null for empty or non-numeric input', () => {
		expect(normalizeWhatsAppNumber('')).toBeNull();
		expect(normalizeWhatsAppNumber(null)).toBeNull();
		expect(normalizeWhatsAppNumber('https://wa.link/fast_accounts')).toBeNull();
	});
});

describe('buildWhatsAppSupportLink', () => {
	it('builds an official wa.me deep link with the pre-filled text when a real phone number is configured', () => {
		const link = buildWhatsAppSupportLink('+234 801 234 5678', 'Hi, order FA-123');
		expect(link).toBe('https://wa.me/2348012345678?text=' + encodeURIComponent('Hi, order FA-123'));
	});

	it('builds a bare wa.me link when there is a phone number but no message', () => {
		const link = buildWhatsAppSupportLink('2348012345678', '');
		expect(link).toBe('https://wa.me/2348012345678');
	});

	it('falls back to the plain wa.link shortlink (without text) when no valid phone is configured', () => {
		// Regression guard: wa.link does not reliably forward a `text` query param to the
		// WhatsApp chat it redirects to, so the fallback must never claim to carry a message.
		const link = buildWhatsAppSupportLink('https://wa.link/fast_accounts', 'Hi, order FA-123');
		expect(link).toBe('https://wa.link/fast_accounts');
	});

	it('falls back to the plain wa.link shortlink when phone is null', () => {
		expect(buildWhatsAppSupportLink(null, 'Hi there')).toBe('https://wa.link/fast_accounts');
	});
});
