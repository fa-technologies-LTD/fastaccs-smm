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
	void rawPhone;
	const baseLink = 'https://wa.link/fast_accounts';
	const normalizedMessage = String(message || '').trim();
	if (!normalizedMessage) return baseLink;
	return `${baseLink}?text=${encodeURIComponent(normalizedMessage)}`;
}
