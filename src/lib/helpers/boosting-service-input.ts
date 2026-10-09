/** Ordinary quantity services; other supplier types need their own input contract. */
export function supportsSimpleBoostInput(providerType: string | null | undefined): boolean {
	const type = String(providerType ?? '')
		.normalize('NFKC')
		.trim()
		.toLowerCase();
	// Some legacy panels omit type for ordinary quantity services.
	return type === '' || type === 'default';
}

export function supportsBoostServiceInput(
	providerType: string | null | undefined,
	outcome: string
): boolean {
	const type = String(providerType ?? '')
		.normalize('NFKC')
		.trim()
		.toLowerCase();
	return outcome === 'custom_comments'
		? type === 'custom comments'
		: supportsSimpleBoostInput(providerType);
}

export const MAX_BOOST_COMMENT_LINES = 500;
export const MAX_BOOST_COMMENT_LENGTH = 500;
export const MAX_BOOST_COMMENT_TEXT_LENGTH = 30_000;

/** Never truncate or duplicate buyer text to satisfy a quantity or checkout minimum. */
export function parseBoostComments(value: unknown): {
	text: string;
	quantity: number;
	error: string | null;
} {
	if (typeof value !== 'string' || !value.trim())
		return { text: '', quantity: 0, error: 'Add your comments, one per line.' };
	if (
		value.length > MAX_BOOST_COMMENT_TEXT_LENGTH ||
		/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
	) {
		return {
			text: '',
			quantity: 0,
			error: 'Shorten your comments and remove special control characters.'
		};
	}
	const lines = value
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	if (lines.length > MAX_BOOST_COMMENT_LINES)
		return { text: '', quantity: 0, error: `Use up to ${MAX_BOOST_COMMENT_LINES} comments.` };
	if (lines.some((line) => line.length > MAX_BOOST_COMMENT_LENGTH))
		return {
			text: '',
			quantity: 0,
			error: `Keep each comment under ${MAX_BOOST_COMMENT_LENGTH + 1} characters.`
		};
	return { text: lines.join('\n'), quantity: lines.length, error: null };
}
