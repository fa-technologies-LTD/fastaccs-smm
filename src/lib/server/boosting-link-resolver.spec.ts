import { describe, expect, it, vi } from 'vitest';
import { resolveBoostingLink } from './boosting-link-resolver';

function redirect(location: string): Response {
	return new Response(null, { status: 302, headers: { location } });
}

describe('server-assisted Boosting link resolution', () => {
	it('does not make a request for an already clear target', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		const result = await resolveBoostingLink(
			'tiktok',
			'followers',
			'https://www.tiktok.com/@fastaccs',
			{ fetchImpl }
		);
		expect(result).toMatchObject({ valid: true, needsManualReview: false });
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('resolves an official TikTok share link to the exact profile target', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(redirect('https://www.tiktok.com/@fastaccs'));
		const result = await resolveBoostingLink(
			'tiktok',
			'followers',
			'https://vm.tiktok.com/ZMabc123/',
			{ fetchImpl }
		);
		expect(result).toMatchObject({
			valid: true,
			needsManualReview: false,
			resolvedRedirect: true,
			normalizedUrl: 'https://www.tiktok.com/@fastaccs'
		});
	});

	it('rejects a resolved content link for a profile-followers order', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockResolvedValue(redirect('https://www.tiktok.com/@fastaccs/video/123456'));
		const result = await resolveBoostingLink(
			'tiktok',
			'followers',
			'https://vt.tiktok.com/ZMabc123/',
			{ fetchImpl }
		);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain('profile');
	});

	it('never follows a redirect away from the selected platform', async () => {
		const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(redirect('http://127.0.0.1/admin'));
		const result = await resolveBoostingLink('spotify', 'streams', 'https://spotify.link/abc123', {
			fetchImpl
		});
		expect(result.valid).toBe(false);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('keeps an official ambiguous link valid for manual review when resolution times out', async () => {
		const fetchImpl = vi
			.fn<typeof fetch>()
			.mockRejectedValue(new DOMException('aborted', 'AbortError'));
		const result = await resolveBoostingLink(
			'facebook',
			'followers',
			'https://www.facebook.com/share/1DS9YYbpNP/',
			{ fetchImpl, timeoutMs: 5 }
		);
		expect(result).toMatchObject({ valid: true, needsManualReview: true });
	});
});
