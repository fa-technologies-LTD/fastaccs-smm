export type BoostingPlatform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'x';
export type BoostingActionType = 'followers' | 'subscribers' | 'likes' | 'views' | 'comments';
export type RequiredLinkType = 'profile' | 'content';

export interface LinkValidationResult {
	valid: boolean;
	reason?: string;
}

const PROFILE_ACTIONS: ReadonlySet<BoostingActionType> = new Set(['followers', 'subscribers']);

const PROFILE_PATTERNS: Record<BoostingPlatform, RegExp> = {
	instagram: /^https?:\/\/(www\.)?instagram\.com\/(?!p\/|reel\/|tv\/|stories\/|explore\/)([a-zA-Z0-9_.]{1,30})\/?(\?.*)?$/,
	tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9_.]{1,30}\/?(\?.*)?$/,
	youtube:
		/^https?:\/\/(www\.)?youtube\.com\/(channel\/[a-zA-Z0-9_-]+|c\/[a-zA-Z0-9_-]+|@[a-zA-Z0-9_.-]+|user\/[a-zA-Z0-9_-]+)\/?(\?.*)?$/,
	facebook:
		/^https?:\/\/(www\.)?facebook\.com\/(profile\.php\?id=\d+|(?!posts\/|photo|watch|videos\/)[a-zA-Z0-9.]{1,100})\/?$/,
	x: /^https?:\/\/(www\.)?(x|twitter)\.com\/[a-zA-Z0-9_]{1,15}\/?(\?.*)?$/
};

const CONTENT_PATTERNS: Record<BoostingPlatform, RegExp> = {
	instagram: /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?/,
	tiktok: /^https?:\/\/((www|vm|vt)\.)?tiktok\.com\/(@[a-zA-Z0-9_.]{1,30}\/video\/\d+|[a-zA-Z0-9]+)\/?/,
	youtube: /^https?:\/\/((www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+|youtu\.be\/[a-zA-Z0-9_-]+)/,
	facebook:
		/^https?:\/\/(www\.)?facebook\.com\/([a-zA-Z0-9.]+\/(posts|videos)\/[a-zA-Z0-9]+|photo(\.php)?\?[a-zA-Z0-9=&]+|watch\/?\?v=\d+)/,
	x: /^https?:\/\/(www\.)?(x|twitter)\.com\/[a-zA-Z0-9_]{1,15}\/status\/\d+/
};

const PLATFORM_LABELS: Record<BoostingPlatform, string> = {
	instagram: 'Instagram',
	tiktok: 'TikTok',
	youtube: 'YouTube',
	facebook: 'Facebook',
	x: 'X'
};

const LINK_TYPE_LABELS: Record<RequiredLinkType, string> = {
	profile: 'profile',
	content: 'post or video'
};

export function getRequiredLinkType(actionType: BoostingActionType): RequiredLinkType {
	return PROFILE_ACTIONS.has(actionType) ? 'profile' : 'content';
}

export function validateLinkForAction(
	platform: BoostingPlatform,
	actionType: BoostingActionType,
	url: string
): LinkValidationResult {
	const trimmed = String(url || '').trim();
	if (!trimmed) {
		return { valid: false, reason: 'Please enter a link.' };
	}

	let parsed: URL;
	try {
		parsed = new URL(trimmed);
	} catch {
		return { valid: false, reason: 'That doesn’t look like a valid link.' };
	}

	if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
		return { valid: false, reason: 'That doesn’t look like a valid link.' };
	}

	const requiredLinkType = getRequiredLinkType(actionType);
	const pattern =
		requiredLinkType === 'profile' ? PROFILE_PATTERNS[platform] : CONTENT_PATTERNS[platform];

	if (!pattern.test(trimmed)) {
		return {
			valid: false,
			reason: `This doesn’t look like a ${PLATFORM_LABELS[platform]} ${LINK_TYPE_LABELS[requiredLinkType]} link.`
		};
	}

	return { valid: true };
}
