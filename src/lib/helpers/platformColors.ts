import { Instagram, Music, Facebook, Twitter, Package } from '@lucide/svelte';
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

// Hardcoded icon mapping for major platforms (Lucide icons)
const platformIcons: Record<string, Component> = {
	instagram: Instagram,
	tiktok: Music,
	facebook: Facebook,
	twitter: Twitter
};

// Platform gradient colors
const platformColors: Record<string, string> = {
	instagram: 'from-pink-500 to-purple-600',
	tiktok: 'from-black to-gray-800',
	facebook: 'from-blue-600 to-blue-700',
	twitter: 'from-blue-400 to-blue-500'
};

/**
 * Get platform icon component.
 * Returns Lucide icon component for known platforms, Package icon otherwise.
 * Frontend should check metadata.icon first for custom image URLs.
 */
function getPlatformIcon(platform: string) {
	return platformIcons[platform.toLowerCase()] || Package;
}

function getPlatformColor(platform: string): string {
	return platformColors[platform.toLowerCase()] || 'from-gray-500 to-gray-600';
}

export { getPlatformIcon, getPlatformColor };
