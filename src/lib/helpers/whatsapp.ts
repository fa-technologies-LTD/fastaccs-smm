function normalizePhoneLikeDigits(input: string): string {
	return input.replace(/[^\d]/g, '');
}

export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
	const trimmed = String(input || '').trim();
	if (!trimmed) return null;

	let digits = normalizePhoneLikeDigits(trimmed);
	if (!digits) return null;
	if (digits.startsWith('00')) {
		digits = digits.slice(2);
	}

	return digits || null;
}

export function buildWhatsAppSupportLink(
	rawPhone: string | null | undefined,
	message: string
): string | null {
	const normalizedMessage = String(message || '').trim();
	const phone = normalizeWhatsAppNumber(rawPhone);

	if (phone) {
		const base = `https://wa.me/${phone}`;
		return normalizedMessage ? `${base}?text=${encodeURIComponent(normalizedMessage)}` : base;
	}

	// No valid phone number configured. wa.link is a third-party shortlink that does not
	// reliably forward a `text` query param to the WhatsApp chat it redirects to, so we
	// can only fall back to it as a plain (unprefilled) link, never with a pre-filled message.
	return 'https://wa.link/fast_accounts';
}
