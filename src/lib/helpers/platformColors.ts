import { Instagram, Music, Facebook, X as XIcon, Package } from '@lucide/svelte';
import type { Component } from 'svelte';

/**
 * Platform Icon Management:
 *
 * 1. PRIORITY: Uses metadata.icon from database if provided (image URL)
 * 2. FALLBACK: Maps to Lucide icons for known platforms (Instagram, TikTok, Facebook, Twitter)
 * 3. DEFAULT: Generic Package icon for unmapped platforms
 *
 * Admin users can provide custom icon URLs in Platform Management.
 * For new platforms (e.g., Snapchat), either:
 *   - Add to platformIcons mapping below, OR
 *   - Upload icon and set metadata.icon URL in admin panel
 */

const platformAliases: Record<string, string> = {
	instagram: 'instagram',
	ig: 'instagram',
	insta: 'instagram',
	tiktok: 'tiktok',
	tik: 'tiktok',
	facebook: 'facebook',
	fb: 'facebook',
	x: 'x',
	twitter: 'x',
	twitterx: 'x',
	formerlytwitter: 'x'
};

function normalizePlatformValue(platform: string): string {
	return platform.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function canonicalizePlatformKey(platform: string): string {
	const normalized = normalizePlatformValue(platform);
	return platformAliases[normalized] || normalized;
}

export function isPlatformImageUrl(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const iconUrl = value.trim();
	if (!iconUrl) return false;

	return (
		iconUrl.startsWith('http://') ||
		iconUrl.startsWith('https://') ||
		iconUrl.startsWith('/') ||
		iconUrl.startsWith('data:')
	);
}

// Hardcoded icon mapping for major platforms (Lucide icons)
const platformIcons: Record<string, Component> = {
	instagram: Instagram,
	tiktok: Music,
	facebook: Facebook,
	x: XIcon
};

// Platform gradient colors
const platformColors: Record<string, string> = {
	instagram: 'from-pink-500 to-purple-600',
	tiktok: 'from-black to-gray-800',
	facebook: 'from-blue-600 to-blue-700',
	x: 'from-zinc-800 to-black'
};

/**
 * Get platform icon component.
 * Returns Lucide icon component for known platforms, Package icon otherwise.
 * Frontend should check metadata.icon first for custom image URLs.
 */
function getPlatformIcon(platform: string) {
	return platformIcons[canonicalizePlatformKey(platform)] || Package;
}

function getPlatformColor(platform: string): string {
	return platformColors[canonicalizePlatformKey(platform)] || 'from-gray-500 to-gray-600';
}

export { getPlatformIcon, getPlatformColor };
