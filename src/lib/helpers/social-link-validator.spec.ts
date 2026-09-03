import { describe, expect, it } from 'vitest';
import { getRequiredLinkType, validateLinkForAction } from './social-link-validator';

describe('social link validator', () => {
	it('maps followers/subscribers to profile links and the rest to content links', () => {
		expect(getRequiredLinkType('followers')).toBe('profile');
		expect(getRequiredLinkType('subscribers')).toBe('profile');
		expect(getRequiredLinkType('likes')).toBe('content');
		expect(getRequiredLinkType('views')).toBe('content');
		expect(getRequiredLinkType('comments')).toBe('content');
	});

	it('accepts a valid Instagram profile link for a followers order', () => {
		expect(validateLinkForAction('instagram', 'followers', 'https://instagram.com/fastaccs').valid).toBe(
			true
		);
	});

	it('rejects an Instagram post link for a followers order', () => {
		const result = validateLinkForAction(
			'instagram',
			'followers',
			'https://www.instagram.com/p/Cabc123XYZ/'
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain('profile');
	});

	it('accepts a valid Instagram post link for a likes order', () => {
		expect(
			validateLinkForAction('instagram', 'likes', 'https://www.instagram.com/p/Cabc123XYZ/').valid
		).toBe(true);
	});

	it('rejects an Instagram profile link for a likes order', () => {
		const result = validateLinkForAction('instagram', 'likes', 'https://instagram.com/fastaccs');
		expect(result.valid).toBe(false);
		expect(result.reason).toContain('post or video');
	});

	it('accepts a TikTok profile link for followers', () => {
		expect(validateLinkForAction('tiktok', 'followers', 'https://www.tiktok.com/@fastaccs').valid).toBe(
			true
		);
	});

	it.each([
		'https://vm.tiktok.com/ZMabc123/',
		'https://vt.tiktok.com/ZSabc123/',
		'https://www.tiktok.com/t/ZT8abc123/'
	])('accepts official TikTok share links for manual review: %s', (url) => {
		const result = validateLinkForAction('tiktok', 'views', url);
		expect(result.valid).toBe(true);
		expect(result.needsManualReview).toBe(true);
	});

	it('accepts a TikTok video link for views', () => {
		expect(
			validateLinkForAction('tiktok', 'views', 'https://www.tiktok.com/@fastaccs/video/1234567890123')
				.valid
		).toBe(true);
	});

	it('accepts a YouTube channel handle link for subscribers', () => {
		expect(
			validateLinkForAction('youtube', 'subscribers', 'https://www.youtube.com/@fastaccs').valid
		).toBe(true);
	});

	it('accepts a YouTube watch link for views', () => {
		expect(
			validateLinkForAction('youtube', 'views', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ').valid
		).toBe(true);
	});

	it.each([
		'https://youtu.be/dQw4w9WgXcQ?si=abc',
		'https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share',
		'https://m.youtube.com/watch?v=dQw4w9WgXcQ'
	])('accepts common YouTube video/share formats: %s', (url) => {
		expect(validateLinkForAction('youtube', 'views', url).valid).toBe(true);
	});

	it('rejects a YouTube channel link for views', () => {
		const result = validateLinkForAction('youtube', 'views', 'https://www.youtube.com/@fastaccs');
		expect(result.valid).toBe(false);
	});

	it('accepts a Facebook profile link for followers', () => {
		expect(validateLinkForAction('facebook', 'followers', 'https://www.facebook.com/fastaccs').valid).toBe(
			true
		);
	});

	it.each([
		'https://www.facebook.com/share/1DS9YYbpNP/?mibextid=wwXIfr',
		'https://m.facebook.com/share/1DS9YYbpNP/?mibextid=wwXIfr',
		'https://web.facebook.com/share/1DS9YYbpNP/'
	])('accepts Facebook share links for profile services: %s', (url) => {
		const result = validateLinkForAction('facebook', 'followers', url);
		expect(result.valid).toBe(true);
		expect(result.needsManualReview).toBe(true);
	});

	it('accepts a Facebook share link for post engagement services', () => {
		expect(
			validateLinkForAction(
				'facebook',
				'likes',
				'https://www.facebook.com/share/p/1AbCdEfGhI/'
			).valid
		).toBe(true);
	});

	it('accepts Facebook mobile post and reel links', () => {
		expect(
			validateLinkForAction('facebook', 'likes', 'https://m.facebook.com/fastaccs/posts/12345')
				.valid
		).toBe(true);
		expect(
			validateLinkForAction('facebook', 'views', 'https://facebook.com/reel/123456789').valid
		).toBe(true);
	});

	it('accepts a Facebook post link for likes', () => {
		expect(
			validateLinkForAction('facebook', 'likes', 'https://www.facebook.com/fastaccs/posts/12345').valid
		).toBe(true);
	});

	it('accepts an X profile link for followers', () => {
		expect(validateLinkForAction('x', 'followers', 'https://x.com/fastaccs').valid).toBe(true);
	});

	it('accepts an X status link for likes', () => {
		expect(validateLinkForAction('x', 'likes', 'https://x.com/fastaccs/status/1234567890').valid).toBe(
			true
		);
	});

	it('rejects malformed URLs outright', () => {
		const result = validateLinkForAction('instagram', 'followers', 'not a url');
		expect(result.valid).toBe(false);
	});

	it('normalizes a platform link pasted without https', () => {
		const result = validateLinkForAction('facebook', 'followers', 'facebook.com/fastaccs');
		expect(result.valid).toBe(true);
		expect(result.normalizedUrl).toBe('https://facebook.com/fastaccs');
	});

	it('rejects a lookalike or wrong-platform domain', () => {
		expect(
			validateLinkForAction('facebook', 'followers', 'https://facebook.com.evil.example/share/abc')
				.valid
		).toBe(false);
		expect(validateLinkForAction('tiktok', 'followers', 'https://instagram.com/fastaccs').valid).toBe(
			false
		);
	});

	it('rejects Facebook link-shim URLs because they can redirect off-platform', () => {
		expect(
			validateLinkForAction(
				'facebook',
				'followers',
				'https://l.facebook.com/l.php?u=https%3A%2F%2Fevil.example'
			).valid
		).toBe(false);
	});

	it('rejects an empty link', () => {
		const result = validateLinkForAction('instagram', 'followers', '   ');
		expect(result.valid).toBe(false);
		expect(result.reason).toContain('enter a link');
	});

	it('treats reposts like other content-link actions (requires a post link, not a profile link)', () => {
		expect(getRequiredLinkType('reposts')).toBe('content');
		expect(validateLinkForAction('x', 'reposts', 'https://x.com/fastaccs/status/1234567890').valid).toBe(
			true
		);
		expect(validateLinkForAction('x', 'reposts', 'https://x.com/fastaccs').valid).toBe(false);
	});
});
