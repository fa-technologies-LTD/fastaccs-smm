const EMAIL_NAME_PLACEHOLDER = /{{\s*(first_name|full_name)\s*}}/gi;

export function getEmailRecipientNames(fullName?: string | null): {
	firstName: string;
	fullName: string;
} {
	const normalizedFullName = String(fullName || '')
		.trim()
		.replace(/\s+/g, ' ');

	if (!normalizedFullName) {
		return { firstName: 'there', fullName: 'there' };
	}

	return {
		firstName: normalizedFullName.split(' ')[0] || 'there',
		fullName: normalizedFullName
	};
}

export function personalizeEmailTemplate(template: string, fullName?: string | null): string {
	const names = getEmailRecipientNames(fullName);

	return template.replace(EMAIL_NAME_PLACEHOLDER, (_match, placeholder: string) =>
		placeholder.toLowerCase() === 'full_name' ? names.fullName : names.firstName
	);
}
