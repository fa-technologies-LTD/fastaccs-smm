export type BoostingPlatform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'x';
export type BoostingActionType =
	| 'followers'
	| 'subscribers'
	| 'likes'
	| 'views'
	| 'comments'
	| 'reposts';
export type RequiredLinkType = 'profile' | 'content';

export interface LinkValidationResult {
	valid: boolean;
	reason?: string;
	normalizedUrl?: string;
	/** An official platform URL whose exact target type cannot be proven from its path alone. */
	needsManualReview?: boolean;
}

const PROFILE_ACTIONS: ReadonlySet<BoostingActionType> = new Set(['followers', 'subscribers']);

const PLATFORM_DOMAINS: Record<BoostingPlatform, readonly string[]> = {
	instagram: ['instagram.com', 'instagr.am'],
	tiktok: ['tiktok.com'],
	youtube: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
	facebook: ['facebook.com', 'fb.com', 'fb.watch'],
	x: ['x.com', 'twitter.com']
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

const RESERVED_PROFILE_SEGMENTS: Partial<Record<BoostingPlatform, ReadonlySet<string>>> = {
	instagram: new Set([
		'about',
		'accounts',
		'direct',
		'explore',
		'p',
		'reel',
		'reels',
		'share',
		'stories',
		'tv'
	]),
	facebook: new Set([
		'groups',
		'help',
		'login',
		'marketplace',
		'permalink.php',
		'photo',
		'photo.php',
		'photos',
		'reel',
		'reels',
		'share',
		'story.php',
		'videos',
		'watch'
	]),
	x: new Set(['compose', 'explore', 'hashtag', 'home', 'i', 'intent', 'messages', 'search', 'share'])
};

function hostnameMatches(hostname: string, baseDomain: string): boolean {
	return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
}

function isAllowedPlatformHostname(platform: BoostingPlatform, hostname: string): boolean {
	// Facebook's link-shim hosts can point anywhere on the internet, so they are not valid targets.
	if (platform === 'facebook' && ['l.facebook.com', 'lm.facebook.com'].includes(hostname)) {
		return false;
	}
	return PLATFORM_DOMAINS[platform].some((domain) => hostnameMatches(hostname, domain));
}

function parseAndNormalizeUrl(rawValue: string): URL | null {
	const trimmed = String(rawValue || '').trim();
	if (!trimmed) return null;

	// Customers often paste the address without a scheme. Only add one to domain-shaped input;
	// never attempt to repair javascript:, data:, file:, or another non-web scheme.
	const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
	try {
		const parsed = new URL(candidate);
		if (!['http:', 'https:'].includes(parsed.protocol)) return null;
		if (parsed.username || parsed.password) return null;
		if (!parsed.hostname || !parsed.pathname) return null;
		parsed.protocol = 'https:';
		parsed.hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
		parsed.port = '';
		return parsed;
	} catch {
		return null;
	}
}

function pathSegments(url: URL): string[] {
	return url.pathname
		.split('/')
		.map((part) => part.trim())
		.filter(Boolean);
}

function classifyInstagram(url: URL): RequiredLinkType | 'unknown' {
	const [first] = pathSegments(url);
	if (!first) return 'unknown';
	const normalized = first.toLowerCase();
	if (['p', 'reel', 'reels', 'tv', 'stories'].includes(normalized)) return 'content';
	if (RESERVED_PROFILE_SEGMENTS.instagram?.has(normalized)) return 'unknown';
	return /^[a-z0-9_.]{1,30}$/i.test(first) ? 'profile' : 'unknown';
}

function classifyTikTok(url: URL): RequiredLinkType | 'unknown' {
	const segments = pathSegments(url);
	const hostname = url.hostname;
	// TikTok's vm/vt and /t/ share URLs redirect to a target and do not expose whether the
	// shared target is a profile or video in the URL itself.
	if (hostname.startsWith('vm.') || hostname.startsWith('vt.') || segments[0] === 't') {
		return 'unknown';
	}
	if (segments[0]?.startsWith('@') && segments[1] === 'video' && segments[2]) return 'content';
	if (segments[0]?.startsWith('@') && segments.length === 1) return 'profile';
	if (['embed', 'v'].includes(segments[0] || '') && segments[1]) return 'content';
	return 'unknown';
}

function classifyYouTube(url: URL): RequiredLinkType | 'unknown' {
	const hostname = url.hostname;
	const segments = pathSegments(url);
	if (hostnameMatches(hostname, 'youtu.be')) return segments[0] ? 'content' : 'unknown';
	if (url.pathname === '/watch' && Boolean(url.searchParams.get('v'))) return 'content';
	if (['shorts', 'live', 'clip', 'embed'].includes(segments[0] || '') && segments[1]) {
		return 'content';
	}
	if (
		segments[0]?.startsWith('@') ||
		(['channel', 'c', 'user'].includes(segments[0] || '') && Boolean(segments[1]))
	) {
		return 'profile';
	}
	return 'unknown';
}

function classifyFacebook(url: URL): RequiredLinkType | 'unknown' {
	const hostname = url.hostname;
	const segments = pathSegments(url);
	const first = (segments[0] || '').toLowerCase();
	const path = url.pathname.toLowerCase();

	if (hostnameMatches(hostname, 'fb.watch')) return segments[0] ? 'content' : 'unknown';
	if (
		path.includes('/posts/') ||
		path.includes('/videos/') ||
		path.includes('/reel/') ||
		path.includes('/reels/') ||
		['watch', 'photo', 'photo.php', 'permalink.php', 'story.php'].includes(first)
	) {
		return 'content';
	}
	if (first === 'profile.php' && Boolean(url.searchParams.get('id'))) return 'profile';
	// Facebook /share/... links can represent pages, profiles, posts, reels or videos. They are
	// official links and providers can resolve them, but their type cannot be inferred locally.
	if (first === 'share' || first === 'share.php') return 'unknown';
	if (['pages', 'people'].includes(first) && segments.length >= 2) return 'profile';
	if (segments.length === 1 && !RESERVED_PROFILE_SEGMENTS.facebook?.has(first)) return 'profile';
	return 'unknown';
}

function classifyX(url: URL): RequiredLinkType | 'unknown' {
	const segments = pathSegments(url);
	const first = (segments[0] || '').toLowerCase();
	if (first === 'i' && segments[1] === 'web' && segments[2] === 'status' && segments[3]) {
		return 'content';
	}
	if (segments[1] === 'status' && segments[2]) return 'content';
	if (segments.length === 1 && !RESERVED_PROFILE_SEGMENTS.x?.has(first)) return 'profile';
	return 'unknown';
}

function classifyTarget(platform: BoostingPlatform, url: URL): RequiredLinkType | 'unknown' {
	switch (platform) {
		case 'instagram':
			return classifyInstagram(url);
		case 'tiktok':
			return classifyTikTok(url);
		case 'youtube':
			return classifyYouTube(url);
		case 'facebook':
			return classifyFacebook(url);
		case 'x':
			return classifyX(url);
	}
}

export function getRequiredLinkType(actionType: BoostingActionType): RequiredLinkType {
	return PROFILE_ACTIONS.has(actionType) ? 'profile' : 'content';
}

export function validateLinkForAction(
	platform: BoostingPlatform,
	actionType: BoostingActionType,
	url: string
): LinkValidationResult {
	const trimmed = String(url || '').trim();
	if (!trimmed) return { valid: false, reason: 'Please enter a link.' };

	const parsed = parseAndNormalizeUrl(trimmed);
	if (!parsed) return { valid: false, reason: 'That doesn’t look like a valid link.' };

	if (!isAllowedPlatformHostname(platform, parsed.hostname)) {
		return { valid: false, reason: `Please enter a ${PLATFORM_LABELS[platform]} link.` };
	}

	const requiredLinkType = getRequiredLinkType(actionType);
	const targetType = classifyTarget(platform, parsed);
	if (targetType !== 'unknown' && targetType !== requiredLinkType) {
		return {
			valid: false,
			reason: `Please enter the ${PLATFORM_LABELS[platform]} ${LINK_TYPE_LABELS[requiredLinkType]} link for this service.`
		};
	}

	return {
		valid: true,
		normalizedUrl: parsed.toString(),
		needsManualReview: targetType === 'unknown'
	};
}
