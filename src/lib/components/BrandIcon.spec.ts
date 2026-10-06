import { describe, expect, it } from 'vitest';

import { brandKey } from './BrandIcon.svelte';

describe('Boosting platform brand icons', () => {
	it.each([
		['Instagram', 'instagram'],
		['TikTok', 'tiktok'],
		['YouTube', 'youtube'],
		['Facebook', 'facebook'],
		['LinkedIn', 'linkedin'],
		['X', 'x'],
		[' X ', 'x'],
		['Threads', 'threads'],
		['Spotify', 'spotify'],
		['Telegram', 'telegram']
	])('maps %s to its official icon', (label, expected) => {
		expect(brandKey(label)).toBe(expected);
	});
});
